import { describe, expect, it } from "vitest";
import type { ProgressEntry } from "../../shared/services/types";
import {
  HomeFeedRefreshCoordinator,
  mergeProgressEntries,
} from "./homeFeedRefresh";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function progress(
  positionSeconds: number,
  syncTimestampMs: number,
): ProgressEntry {
  return {
    accountId: "account-1",
    mediaId: "media-1",
    positionSeconds,
    durationSeconds: 3600,
    syncTimestampMs,
    completed: false,
    updatedAt: new Date(syncTimestampMs).toISOString(),
  };
}

describe("HomeFeedRefreshCoordinator", () => {
  it("does not apply an older refresh after a newer refresh finishes", async () => {
    const coordinator = new HomeFeedRefreshCoordinator<number>();
    const older = deferred<number>();
    const newer = deferred<number>();
    const applied: number[] = [];

    const olderRefresh = coordinator.run(
      () => older.promise,
      (value) => {
        applied.push(value);
      },
    );
    const newerRefresh = coordinator.run(
      () => newer.promise,
      (value) => {
        applied.push(value);
      },
    );

    newer.resolve(120);
    await newerRefresh;
    older.resolve(60);
    await olderRefresh;

    expect(applied).toEqual([120]);
  });
});

describe("mergeProgressEntries", () => {
  it("keeps a newer live update when a stale poll finishes later", () => {
    expect(
      mergeProgressEntries([progress(120, 2_000)], [progress(60, 1_000)]),
    ).toEqual([progress(120, 2_000)]);
  });

  it("drops cached progress belonging to a different signed-in account", () => {
    const previousAccount = progress(120, 2_000);
    const currentAccount = {
      ...progress(60, 3_000),
      accountId: "account-2",
    };

    expect(
      mergeProgressEntries([previousAccount], [currentAccount], "account-2"),
    ).toEqual([currentAccount]);
  });
});
