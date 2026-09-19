import { describe, expect, it } from "vitest";
import type { MediaItem, ProgressEntry } from "../../shared/services/types";
import { buildHomeCurationFeed } from "./homeCuration";

function createMedia(
  overrides: Partial<MediaItem> & { id: string; title: string },
): MediaItem {
  const defaults: MediaItem = {
    id: overrides.id,
    title: overrides.title,
    normalizedTitle: overrides.title.toLowerCase(),
    tags: ["Drama"],
    description: null,
    releaseYear: 2024,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    dedupeKey: overrides.id,
    relativePath: `${overrides.title}.mkv`,
    filePath: `C:\\media\\${overrides.title}.mkv`,
    extension: ".mkv",
    container: null,
    type: "movie",
    digitalMediaType: "video",
    sizeBytes: 100,
    durationSeconds: 5400,
    width: 1920,
    height: 1080,
    videoCodec: "h264",
    audioCodec: null,
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: null,
    backdropImagePath: null,
    chapterThumbnails: [],
    mediaDetails: {
      formatName: null,
      bitRate: null,
      frameRate: null,
      audioChannels: null,
    },
    metadataRefreshedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return { ...defaults, ...overrides };
}

function createProgress(
  overrides: Partial<ProgressEntry> & { mediaId: string },
): ProgressEntry {
  return {
    mediaId: overrides.mediaId,
    positionSeconds: overrides.positionSeconds ?? 600,
    durationSeconds: overrides.durationSeconds ?? 5400,
    completed: overrides.completed ?? false,
    updatedAt: overrides.updatedAt ?? "2026-01-02T00:00:00.000Z",
  };
}

describe("buildHomeCurationFeed", () => {
  it("uses raw playable Media Items for Continue Watching and respects dismissals", () => {
    const episode = createMedia({
      id: "episode-1",
      title: "Episode 1",
      type: "show",
      seasonNumber: 1,
      episodeNumber: 1,
    });
    const feed = buildHomeCurationFeed({
      mediaItems: [episode],
      progressItems: [createProgress({ mediaId: "episode-1" })],
      dismissedContinueWatchingIds: new Set(["episode-1"]),
      randomSeed: 123,
      experience: "phone",
    });

    expect(feed.continueWatching).toEqual([]);
  });

  it("hides accidental starts and near-finished items from Continue Watching", () => {
    const accidental = createMedia({
      id: "accidental",
      title: "Accidental Start",
    });
    const finished = createMedia({ id: "finished", title: "Almost Finished" });
    const feed = buildHomeCurationFeed({
      mediaItems: [accidental, finished],
      progressItems: [
        createProgress({ mediaId: "accidental", positionSeconds: 2 }),
        createProgress({
          mediaId: "finished",
          positionSeconds: 5350,
          durationSeconds: 5400,
        }),
      ],
      dismissedContinueWatchingIds: new Set(),
      randomSeed: 123,
      experience: "desktop",
    });

    expect(feed.continueWatching).toEqual([]);
  });

  it("shows a long video promptly without waiting for a percentage threshold", () => {
    const movie = createMedia({
      id: "long-movie",
      title: "Long Movie",
      durationSeconds: 14_400,
    });
    const feed = buildHomeCurationFeed({
      mediaItems: [movie],
      progressItems: [
        createProgress({
          mediaId: movie.id,
          positionSeconds: 6,
          durationSeconds: movie.durationSeconds,
        }),
      ],
      dismissedContinueWatchingIds: new Set(),
      randomSeed: 123,
      experience: "desktop",
    });

    expect(feed.continueWatching.map((entry) => entry.item.id)).toEqual([
      movie.id,
    ]);
  });

  it("keeps Discover focused on unseen Media Items and adds Because You Watched", () => {
    const watched = createMedia({
      id: "watched",
      title: "Watched",
      tags: ["Space"],
    });
    const unseenSimilar = createMedia({
      id: "unseen-similar",
      title: "Unseen Similar",
      tags: ["Space"],
    });
    const unseenOther = createMedia({
      id: "unseen-other",
      title: "Unseen Other",
      tags: ["Mystery"],
    });
    const feed = buildHomeCurationFeed({
      mediaItems: [watched, unseenSimilar, unseenOther],
      progressItems: [createProgress({ mediaId: "watched", completed: true })],
      dismissedContinueWatchingIds: new Set(),
      randomSeed: 123,
      experience: "phone",
    });

    expect(feed.discoverItems.map((item) => item.id)).not.toContain("watched");
    expect(feed.becauseYouWatchedItems.map((item) => item.id)).toContain(
      "unseen-similar",
    );
  });
});
