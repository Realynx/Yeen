import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SubtitlePreExtractionPanel,
  SubtitlePreExtractionProgressView,
} from "./SubtitlePreExtractionPanel";

describe("SubtitlePreExtractionPanel", () => {
  it("offers the Administrator a manual Subtitle Extraction action", () => {
    const markup = renderToStaticMarkup(
      <SubtitlePreExtractionPanel token="admin-token" />,
    );

    expect(markup).toContain("Prepare embedded subtitles");
    expect(markup).toContain("Extract Missing Subtitles");
    expect(markup).toContain("Checking extraction status...");
  });

  it("reports extraction progress, unsupported tracks, and the latest failure", () => {
    const markup = renderToStaticMarkup(
      <SubtitlePreExtractionProgressView
        progress={{
          jobId: "job-1",
          status: "completed",
          totalMediaItems: 4,
          processedMediaItems: 4,
          extractedTracks: 5,
          existingTracks: 2,
          unsupportedTracks: 1,
          failedTracks: 1,
          failedMediaItems: 1,
          currentMediaTitle: null,
          message: "Subtitle extraction complete.",
          error: null,
          lastFailure: "Episode Four: 1 Subtitle Track could not be extracted.",
          startedAt: "2026-08-21T12:00:00.000Z",
          updatedAt: "2026-08-21T12:01:00.000Z",
          completedAt: "2026-08-21T12:01:00.000Z",
        }}
      />,
    );

    expect(markup).toContain("4/4 media inspected");
    expect(markup).toContain("1 unsupported");
    expect(markup).toContain("Episode Four");
  });
});
