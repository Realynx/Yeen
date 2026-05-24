import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';

export function buildDedupeKey(input: {
  mediaType: 'movie' | 'show' | 'other';
  normalizedTitle: string;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number;
}): string {
  const safeTitle = input.normalizedTitle || 'untitled';

  if (input.mediaType === 'show') {
    const season = input.seasonNumber ?? 0;
    const episode = input.episodeNumber ?? 0;
    return `show:${safeTitle}:s${season}:e${episode}`;
  }

  if (input.mediaType === 'movie') {
    return `movie:${safeTitle}:y${input.releaseYear ?? 0}`;
  }

  const durationBucket = Math.max(0, Math.round(input.durationSeconds / 300));
  return `other:${safeTitle}:y${input.releaseYear ?? 0}:d${durationBucket}`;
}

export function extractEpisodeTitleFromTags(
  tags: Record<string, string | undefined> | undefined,
): string | null {
  if (!tags) {
    return null;
  }

  const lowerCasedTags = new Map<string, string>();
  for (const [key, value] of Object.entries(tags)) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    lowerCasedTags.set(key.toLowerCase(), trimmed);
  }

  const episodeTitleKeys = [
    'episode_title',
    'episodetitle',
    'episode title',
    'title',
  ];

  for (const key of episodeTitleKeys) {
    const value = lowerCasedTags.get(key);
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeEpisodeTitle(
  episodeTitle: string | null,
  seriesTitle: string,
): string | null {
  if (!episodeTitle) {
    return null;
  }

  const trimmed = episodeTitle.trim();
  if (!trimmed) {
    return null;
  }

  if (normalizeForKey(trimmed) === normalizeForKey(seriesTitle)) {
    return null;
  }

  return trimmed;
}

export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

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

export function shouldUseJikanFallback(
  relativePath: string,
  mediaType: 'movie' | 'show' | 'other',
  title: string,
): boolean {
  const normalizedPath = relativePath.toLowerCase();
  const hasAnimePathHint =
    normalizedPath.includes('/anime/') ||
    normalizedPath.includes('/animes/') ||
    normalizedPath.includes('/animation/anime/');

  if (hasAnimePathHint) {
    return true;
  }

  if (mediaType !== 'show') {
    return false;
  }

  return isLikelyAnimeTitle(title);
}

export function guessType(
  relativePath: string,
  seasonEpisode: {
    seasonNumber: number | null;
    episodeNumber: number | null;
  },
): 'movie' | 'show' | 'other' {
  // Any concrete season/episode signal (from the filename OR a season
  // folder like "Show/Season 02/") is the strongest hint that this
  // file is part of a series.
  if (
    seasonEpisode.seasonNumber !== null ||
    seasonEpisode.episodeNumber !== null
  ) {
    return 'show';
  }

  const normalized = relativePath.toLowerCase();
  if (
    normalized.includes('/shows/') ||
    normalized.includes('/show/') ||
    normalized.includes('/tv/') ||
    normalized.includes('/series/')
  ) {
    return 'show';
  }

  if (
    normalized.includes('/movies/') ||
    normalized.includes('/movie/') ||
    normalized.includes('/films/')
  ) {
    return 'movie';
  }

  return 'other';
}

function isLikelyAnimeTitle(title: string): boolean {
  const cleaned = title.trim();
  if (!cleaned) {
    return false;
  }

  if (
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(cleaned)
  ) {
    return true;
  }

  const tokens = new Set(normalizeForKey(cleaned).split(' ').filter(Boolean));
  const animeMarkers = [
    'anime',
    'ova',
    'ona',
    'oad',
    'isekai',
    'senpai',
    'chan',
    'kun',
    'sama',
    'shonen',
    'shounen',
    'seinen',
    'josei',
    'shippuden',
  ];

  for (const marker of animeMarkers) {
    if (tokens.has(marker)) {
      return true;
    }
  }

  return false;
}
