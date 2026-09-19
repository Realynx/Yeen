import { extractSubtitle, listSubtitleTracks } from "../../shared/services/api";
import type { SubtitleTrack } from "../../shared/services/types";

interface ExtractedSubtitleResult {
  tracks: SubtitleTrack[];
  selectedSubtitleId: string;
}

function resolveExtractedSubtitleId(
  tracks: SubtitleTrack[],
  previousTrack: SubtitleTrack,
  extractedUrl: string,
): string {
  const extractedTrack =
    tracks.find((candidate) => {
      return (
        typeof candidate.streamIndex === "number" &&
        candidate.streamIndex === previousTrack.streamIndex &&
        Boolean(candidate.url)
      );
    }) ??
    tracks.find((candidate) => candidate.url === extractedUrl) ??
    tracks.find(
      (candidate) =>
        candidate.id === previousTrack.id && Boolean(candidate.url),
    ) ??
    null;

  return extractedTrack?.id ?? "";
}

function reconcileExtractedTrack(
  tracks: SubtitleTrack[],
  previousTrack: SubtitleTrack,
  extractedUrl: string,
): SubtitleTrack[] {
  const matchingIndex = tracks.findIndex((candidate) => {
    return (
      (typeof candidate.streamIndex === "number" &&
        candidate.streamIndex === previousTrack.streamIndex) ||
      candidate.id === previousTrack.id
    );
  });

  if (matchingIndex < 0) {
    return [...tracks, { ...previousTrack, url: extractedUrl }];
  }

  if (tracks[matchingIndex].url) {
    return tracks;
  }

  return tracks.map((candidate, index) =>
    index === matchingIndex ? { ...candidate, url: extractedUrl } : candidate,
  );
}

export async function extractSubtitleTrackAndReload(
  token: string,
  mediaId: string,
  track: SubtitleTrack,
): Promise<ExtractedSubtitleResult> {
  const extracted = await extractSubtitle(
    token,
    mediaId,
    track.streamIndex as number,
  );
  const listedTracks = await listSubtitleTracks(token, mediaId);
  const tracks = reconcileExtractedTrack(listedTracks, track, extracted.url);

  return {
    tracks,
    selectedSubtitleId: resolveExtractedSubtitleId(
      tracks,
      track,
      extracted.url,
    ),
  };
}
