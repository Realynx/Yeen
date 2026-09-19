import { afterEach, describe, expect, it, vi } from "vitest";
import { startHlsSession, upsertProgress } from "./api-playback";
import { subscribeToProgressUpdates } from "./progressUpdates";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startHlsSession", () => {
  it("sends every selected transcode profile value to the HLS start endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "session-1",
          manifestUrl: "/api/stream/hls/session-1/master.m3u8",
          totalDurationSeconds: 1451,
          selectedAudioStreamIndex: 2,
          maxVideoBitrateKbps: 8_000,
          audioBitrateKbps: 192,
          maxOutputHeight: 1440,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startHlsSession("token", "media/id", {
      forceFresh: true,
      audioStreamIndex: 2,
      maxVideoBitrateKbps: 8_000,
      audioBitrateKbps: 192,
      maxOutputHeight: 1440,
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/api/stream/media/id/hls/start");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      force: "1",
      audioStreamIndex: "2",
      maxVideoBitrateKbps: "8000",
      audioBitrateKbps: "192",
      maxOutputHeight: "1440",
    });
  });
});

describe("upsertProgress", () => {
  it("publishes the server-confirmed account progress immediately", async () => {
    const progress = {
      accountId: "account-1",
      mediaId: "media-1",
      positionSeconds: 120,
      durationSeconds: 3600,
      syncTimestampMs: 2_000,
      completed: false,
      updatedAt: "2026-01-01T00:00:02.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(progress), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToProgressUpdates("account-1", listener);

    await upsertProgress("token", progress.mediaId, {
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.durationSeconds,
      syncTimestampMs: progress.syncTimestampMs,
    });

    expect(listener).toHaveBeenCalledWith(progress);
    unsubscribe();
  });
});
