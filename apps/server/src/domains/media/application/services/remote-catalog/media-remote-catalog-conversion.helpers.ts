import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import type { TmdbRemoteCandidate } from '../remote-metadata/tmdb-metadata.service';
import type { JikanRemoteCandidate } from '../remote-metadata/jikan-metadata.service';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;
type RemoteMediaProvider = 'tmdb' | 'jikan';

export interface ParsedRemoteMediaId {
  provider: RemoteMediaProvider;
  mediaType: 'movie' | 'show';
  providerId: string;
}

export function parseRemoteMediaIdValue(
  mediaId: string,
): ParsedRemoteMediaId | null {
  const cleanedId = mediaId.trim();
  const match = cleanedId.match(
    /^remote_(tmdb|jikan)_(movie|show)_([A-Za-z0-9-]{1,64})$/,
  );

  if (!match) {
    return null;
  }

  return {
    provider: match[1] as RemoteMediaProvider,
    mediaType: match[2] as 'movie' | 'show',
    providerId: match[3],
  };
}

export function toRemoteMediaItemValue(
  candidate: RemoteMediaCandidate,
  sourceLabel: string,
): MediaItem {
  const now = new Date().toISOString();

  return {
    id: `remote_${candidate.provider}_${candidate.mediaType}_${candidate.providerId}`,
    title: candidate.title,
    normalizedTitle: normalizeForKey(candidate.title),
    tags: normalizeEditableTagsValue(candidate.tags ?? []),
    description: candidate.overview,
    releaseYear: candidate.releaseYear,
    seasonNumber: null,
    episodeNumber: null,
    episodeTitle: null,
    dedupeKey: `remote:${candidate.provider}:${candidate.mediaType}:${candidate.providerId}`,
    relativePath: `Remote catalog result (${sourceLabel})`,
    filePath: `remote://${candidate.provider}/${candidate.providerId}`,
    extension: '.api',
    container: null,
    type: candidate.mediaType,
    digitalMediaType: 'video',
    sizeBytes: 0,
    durationSeconds:
      typeof candidate.runtimeSeconds === 'number' &&
      Number.isFinite(candidate.runtimeSeconds) &&
      candidate.runtimeSeconds > 0
        ? Math.round(candidate.runtimeSeconds)
        : 0,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    subtitleStreams: 0,
    subtitleDetails: [],
    previewImagePath: candidate.posterUrl,
    backdropImagePath: candidate.backdropUrl,
    chapterThumbnails: [],
    mediaDetails: {
      formatName: null,
      bitRate: null,
      frameRate: null,
      audioChannels: null,
    },
    metadataRefreshedAt: now,
    updatedAt: now,
    isRemote: true,
    remoteSource: candidate.provider,
    remoteSourceId: candidate.providerId,
    remoteSourceLabel: sourceLabel,
  };
}

export function normalizeEditableTagsValue(tags: readonly string[]): string[] {
  const deduped = new Map<string, string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }
    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }
  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

export function remoteSourceLabelValue(provider: RemoteMediaProvider): string {
  return provider === 'tmdb' ? 'TMDB' : 'Jikan';
}
