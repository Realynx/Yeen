import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSubtitlePreExtractionProgress,
  startSubtitlePreExtraction,
} from "./api-subtitle-maintenance";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subtitle pre-extraction API", () => {
  it("starts and polls the Administrator maintenance job", async () => {
    const payload = {
      jobId: "job-1",
      status: "running",
      totalMediaItems: 3,
      processedMediaItems: 1,
      extractedTracks: 2,
      existingTracks: 1,
      unsupportedTracks: 0,
      failedTracks: 0,
      failedMediaItems: 0,
      currentMediaTitle: "Episode One",
      message: "Extracting subtitles...",
      error: null,
      lastFailure: null,
      startedAt: "2026-08-21T12:00:00.000Z",
      updatedAt: "2026-08-21T12:00:01.000Z",
      completedAt: null,
    };
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startSubtitlePreExtraction("admin-token");
    await getSubtitlePreExtractionProgress("admin-token");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/admin/subtitles/pre-extraction/start",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/admin/subtitles/pre-extraction/status",
      expect.objectContaining({}),
    );
  });
});
