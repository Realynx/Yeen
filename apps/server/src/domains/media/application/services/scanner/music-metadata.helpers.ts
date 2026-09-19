import type { MusicMetadata } from '../../../domain/entities/media-item.entity';
import type {
  FfprobePayload,
  FfprobeStream,
} from '../../../infrastructure/media-probe.adapter';

export const MUSIC_FILE_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.alac',
  '.ape',
  '.flac',
  '.m4a',
  '.mka',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.wma',
]);

export function isMusicExtension(extension: string): boolean {
  return MUSIC_FILE_EXTENSIONS.has(extension.trim().toLowerCase());
}

export function findEmbeddedArtworkStream(
  streams: readonly FfprobeStream[],
): FfprobeStream | undefined {
  return streams.find(
    (stream) =>
      stream.codec_type === 'video' &&
      (stream.disposition?.attached_pic ?? 0) > 0,
  );
}

export function extractMusicMetadata(
  payload: FfprobePayload,
  relativePath: string,
  hasEmbeddedArtwork: boolean,
  hasSidecarArtwork: boolean,
): MusicMetadata & { title: string | null; releaseYear: number | null } {
  const tags = collectTags(payload);
  const inferred = inferPathMetadata(relativePath);
  const date = readTag(tags, ['date', 'year', 'originaldate']);

  return {
    title: readTag(tags, ['title']) ?? null,
    artist:
      readTag(tags, ['artist', 'artists', 'performer']) ?? inferred.artist,
    album: readTag(tags, ['album']) ?? inferred.album,
    albumArtist:
      readTag(tags, ['album_artist', 'albumartist', 'album artist']) ?? null,
    trackNumber: parseOrdinal(readTag(tags, ['track', 'tracknumber'])),
    discNumber: parseOrdinal(
      readTag(tags, ['disc', 'discnumber', 'disk', 'disknumber']),
    ),
    genre: readTag(tags, ['genre']) ?? null,
    releaseYear: parseYear(date),
    artworkKind: hasEmbeddedArtwork
      ? 'embedded'
      : hasSidecarArtwork
        ? 'sidecar'
        : 'none',
  };
}

function collectTags(payload: FfprobePayload): Map<string, string> {
  const result = new Map<string, string>();
  const collections = [
    payload.format?.tags,
    ...(payload.streams ?? []).map((stream) => stream.tags),
  ];

  for (const collection of collections) {
    for (const [rawKey, rawValue] of Object.entries(collection ?? {})) {
      const key = rawKey.trim().toLowerCase();
      const value = rawValue?.trim();
      if (key && value && !result.has(key)) {
        result.set(key, value);
      }
    }
  }

  return result;
}

function readTag(
  tags: ReadonlyMap<string, string>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = tags.get(key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseOrdinal(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{1,4})(?:\s*\/\s*\d{1,4})?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseYear(value: string | undefined): number | null {
  const match = value?.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function inferPathMetadata(relativePath: string): {
  artist: string | null;
  album: string | null;
} {
  const segments = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 3) {
    return { artist: null, album: null };
  }

  return {
    artist: segments.at(-3) ?? null,
    album: segments.at(-2) ?? null,
  };
}
