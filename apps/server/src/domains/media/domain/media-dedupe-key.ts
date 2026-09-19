import type {
  MediaLibraryType,
  MusicMetadata,
} from './entities/media-item.entity';

export interface MediaDedupeIdentity {
  type: 'movie' | 'show' | 'other';
  normalizedTitle: string;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number;
  libraryType: MediaLibraryType;
  musicMetadata: MusicMetadata | null;
}

export function buildMediaDedupeKey(item: MediaDedupeIdentity): string {
  const safeTitle = item.normalizedTitle || 'untitled';

  if (item.libraryType === 'music') {
    return buildMusicDedupeKey(item, safeTitle);
  }

  if (item.type === 'show') {
    return buildEpisodeDedupeKey(item, safeTitle);
  }

  if (item.type === 'movie') {
    return `movie:${safeTitle}:y${numberOrZero(item.releaseYear)}`;
  }

  const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
  return `other:${safeTitle}:y${numberOrZero(item.releaseYear)}:d${durationBucket}`;
}

function buildMusicDedupeKey(
  item: MediaDedupeIdentity,
  safeTitle: string,
): string {
  const artist = normalizeKeyPart(item.musicMetadata?.artist ?? 'unknown');
  const album = normalizeKeyPart(item.musicMetadata?.album ?? 'unknown');
  const disc = numberOrZero(item.musicMetadata?.discNumber);
  const track = numberOrZero(item.musicMetadata?.trackNumber);
  return `music:${artist}:${album}:d${disc}:t${track}:${safeTitle}`;
}

function buildEpisodeDedupeKey(
  item: MediaDedupeIdentity,
  safeTitle: string,
): string {
  return `show:${safeTitle}:s${numberOrZero(item.seasonNumber)}:e${numberOrZero(item.episodeNumber)}`;
}

function numberOrZero(value: number | null | undefined): number {
  return value ?? 0;
}

function normalizeKeyPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() || 'unknown'
  );
}
