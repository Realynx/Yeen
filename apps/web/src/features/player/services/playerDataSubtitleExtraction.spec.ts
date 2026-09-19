import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubtitleTrack } from "../../shared/services/types";

const api = vi.hoisted(() => ({
  extractSubtitle: vi.fn(),
  listSubtitleTracks: vi.fn(),
}));

vi.mock("../../shared/services/api", () => api);

import { extractSubtitleTrackAndReload } from "./playerDataSubtitleExtraction";

describe("extractSubtitleTrackAndReload", () => {
  beforeEach(() => {
    api.extractSubtitle.mockReset();
    api.listSubtitleTracks.mockReset();
  });

  it("selects and exposes a successfully extracted track when the immediate re-list is stale", async () => {
    const track: SubtitleTrack = {
      id: "embedded-4",
      kind: "embedded",
      label: "English",
      language: "en",
      format: "ass",
      extractable: true,
      streamIndex: 4,
      url: null,
    };
    api.extractSubtitle.mockResolvedValue({
      mediaId: "episode-1",
      streamIndex: 4,
      url: "/api/subtitles/file/episode-1/embedded_4_v2.vtt",
    });
    api.listSubtitleTracks.mockResolvedValue([{ ...track }]);

    const result = await extractSubtitleTrackAndReload(
      "token",
      "episode-1",
      track,
    );

    expect(result.selectedSubtitleId).toBe("embedded-4");
    expect(result.tracks[0]?.url).toBe(
      "/api/subtitles/file/episode-1/embedded_4_v2.vtt",
    );
  });
});
