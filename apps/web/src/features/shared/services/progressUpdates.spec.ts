import { describe, expect, it, vi } from "vitest";
import type { ProgressEntry } from "./types";
import {
  publishProgressUpdate,
  subscribeToProgressUpdates,
} from "./progressUpdates";

function progress(accountId: string): ProgressEntry {
  return {
    accountId,
    mediaId: "media-1",
    positionSeconds: 120,
    durationSeconds: 3600,
    syncTimestampMs: 2_000,
    completed: false,
    updatedAt: "2026-01-01T00:00:02.000Z",
  };
}

describe("progressUpdates", () => {
  it("delivers successful progress writes only to the matching account", () => {
    const accountOneListener = vi.fn();
    const accountTwoListener = vi.fn();
    const unsubscribeOne = subscribeToProgressUpdates(
      "account-1",
      accountOneListener,
    );
    const unsubscribeTwo = subscribeToProgressUpdates(
      "account-2",
      accountTwoListener,
    );

    publishProgressUpdate(progress("account-1"));

    expect(accountOneListener).toHaveBeenCalledOnce();
    expect(accountTwoListener).not.toHaveBeenCalled();
    unsubscribeOne();
    unsubscribeTwo();
  });

  it("does not let a UI listener break progress persistence", () => {
    const unsubscribe = subscribeToProgressUpdates("account-1", () => {
      throw new Error("render failed");
    });

    expect(() => publishProgressUpdate(progress("account-1"))).not.toThrow();
    unsubscribe();
  });
});
