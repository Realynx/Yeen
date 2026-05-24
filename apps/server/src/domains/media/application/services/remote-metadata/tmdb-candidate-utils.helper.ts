import {
  extractNumericStringId as sharedExtractNumericStringId,
  normalizeForExactMatch as sharedNormalizeForExactMatch,
  normalizeLabel as sharedNormalizeLabel,
  normalizeTags as sharedNormalizeTags,
} from './remote-metadata-normalization';
import {
  TMDB_MOVIE_GENRES_BY_ID,
  TMDB_SHOW_GENRES_BY_ID,
  type TmdbCandidate,
  type TmdbLookupInput,
  type TmdbSeriesEpisode,
} from './tmdb-metadata.types';

export function endpointForType(
  mediaType: 'movie' | 'show' | 'other',
): 'movie' | 'tv' | 'multi' {
  if (mediaType === 'movie') return 'movie';
  if (mediaType === 'show') return 'tv';
  return 'multi';
}

export function resolveTmdbSourceId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }
  return null;
}

export function toCandidate(
  item: unknown,
  mediaType: 'movie' | 'show' | 'other',
  posterImageBaseUrl: string,
  backdropImageBaseUrl: string,
): TmdbCandidate | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }

  const value = item as Record<string, unknown>;
  const pickedTitle = pickTitle(value, mediaType);
  if (!pickedTitle) return null;

  const titlesForMatch = collectTitles(value, pickedTitle);
  if (titlesForMatch.length === 0) return null;

  const releaseDate =
    typeof value.release_date === 'string'
      ? value.release_date
      : typeof value.first_air_date === 'string'
        ? value.first_air_date
        : '';
  const candidateMediaType = resolveCandidateMediaType(value, mediaType);

  return {
    title: pickedTitle,
    titlesForMatch,
    tags: extractTags(value, candidateMediaType),
    overview:
      typeof value.overview === 'string' && value.overview.trim()
        ? value.overview.trim()
        : null,
    releaseYear: extractYear(releaseDate),
    posterUrl:
      typeof value.poster_path === 'string' && value.poster_path.trim()
        ? `${posterImageBaseUrl}${value.poster_path}`
        : null,
    backdropUrl:
      typeof value.backdrop_path === 'string' && value.backdrop_path.trim()
        ? `${backdropImageBaseUrl}${value.backdrop_path}`
        : null,
  };
}

function collectTitles(
  value: Record<string, unknown>,
  preferredTitle: string,
): string[] {
  const titles = new Set<string>();
  addTitle(titles, preferredTitle);
  addTitle(titles, value.title);
  addTitle(titles, value.name);
  addTitle(titles, value.original_title);
  addTitle(titles, value.original_name);
  return [...titles];
}

function addTitle(titles: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const cleaned = value.trim();
  if (cleaned) titles.add(cleaned);
}

export function resolveCandidateMediaType(
  value: Record<string, unknown>,
  requestedType: 'movie' | 'show' | 'other',
): 'movie' | 'show' | 'other' {
  if (requestedType === 'movie' || requestedType === 'show')
    return requestedType;
  const rawType =
    typeof value.media_type === 'string'
      ? value.media_type.trim().toLowerCase()
      : '';
  if (rawType === 'movie') return 'movie';
  if (rawType === 'tv') return 'show';
  return 'other';
}

function extractTags(
  value: Record<string, unknown>,
  mediaType: 'movie' | 'show' | 'other',
): string[] {
  const tags: string[] = [];

  const namedGenres = Array.isArray(value.genres) ? value.genres : [];
  for (const genre of namedGenres) {
    if (typeof genre !== 'object' || genre === null || Array.isArray(genre)) {
      continue;
    }
    const name = (genre as Record<string, unknown>).name;
    if (typeof name !== 'string') continue;
    const cleaned = name.trim();
    if (cleaned) tags.push(cleaned);
  }

  const genreIds = Array.isArray(value.genre_ids) ? value.genre_ids : [];
  for (const genreId of genreIds) {
    if (typeof genreId !== 'number' || !Number.isFinite(genreId)) continue;
    const id = Math.trunc(genreId);
    const movieGenre = TMDB_MOVIE_GENRES_BY_ID[id] ?? null;
    const showGenre = TMDB_SHOW_GENRES_BY_ID[id] ?? null;

    if (mediaType === 'movie' && movieGenre) {
      tags.push(movieGenre);
      continue;
    }
    if (mediaType === 'show' && showGenre) {
      tags.push(showGenre);
      continue;
    }
    if (mediaType === 'other') {
      if (movieGenre) {
        tags.push(movieGenre);
        continue;
      }
      if (showGenre) tags.push(showGenre);
    }
  }

  return sharedNormalizeTags(tags);
}

export function filterExactTitleCandidates<T extends TmdbCandidate>(
  candidates: T[],
  input: TmdbLookupInput,
): T[] {
  const normalizedInput = sharedNormalizeForExactMatch(input.title);
  if (!normalizedInput) return [];

  return candidates.filter((candidate) => {
    const exactTitleMatch = candidate.titlesForMatch.some(
      (title) => sharedNormalizeForExactMatch(title) === normalizedInput,
    );
    if (!exactTitleMatch) return false;

    if (
      input.releaseYear &&
      candidate.releaseYear &&
      input.releaseYear !== candidate.releaseYear
    ) {
      return false;
    }

    return true;
  });
}

function pickTitle(
  value: Record<string, unknown>,
  mediaType: 'movie' | 'show' | 'other',
): string | null {
  const movieTitle = typeof value.title === 'string' ? value.title : null;
  const tvTitle = typeof value.name === 'string' ? value.name : null;
  const picked =
    mediaType === 'movie'
      ? (movieTitle ?? tvTitle)
      : mediaType === 'show'
        ? (tvTitle ?? movieTitle)
        : (movieTitle ?? tvTitle);
  if (!picked) return null;
  const cleaned = picked.trim();
  return cleaned || null;
}

export function pickBestCandidate<T extends TmdbCandidate>(
  candidates: T[],
  input: TmdbLookupInput,
): T {
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const yearScore =
      input.releaseYear && candidate.releaseYear
        ? input.releaseYear === candidate.releaseYear
          ? 0.7
          : 0
        : 0;
    const score =
      yearScore +
      (candidate.posterUrl ? 0.14 : 0) +
      (candidate.backdropUrl ? 0.1 : 0) +
      (candidate.overview ? 0.08 : 0);

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function extractYear(value: string): number | null {
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractNumericId(value: unknown): string | null {
  return sharedExtractNumericStringId(value);
}

export function extractRuntimeSeconds(
  value: { runtime?: unknown; episode_run_time?: unknown },
  mediaType: 'movie' | 'show',
): number | null {
  if (mediaType === 'movie') {
    if (
      typeof value.runtime === 'number' &&
      Number.isFinite(value.runtime) &&
      value.runtime > 0
    ) {
      return Math.round(value.runtime * 60);
    }
    return null;
  }

  if (!Array.isArray(value.episode_run_time)) return null;
  for (const runTime of value.episode_run_time) {
    if (
      typeof runTime === 'number' &&
      Number.isFinite(runTime) &&
      runTime > 0
    ) {
      return Math.round(runTime * 60);
    }
  }
  return null;
}

export function resolveGenreId(
  normalizedTag: string,
  genresById: Record<number, string>,
): number | null {
  const normalizedCandidates = new Set<string>([normalizedTag]);
  addTagAliases(normalizedTag, normalizedCandidates);

  for (const candidate of normalizedCandidates) {
    for (const [id, label] of Object.entries(genresById)) {
      const normalizedLabel = normalizeGenreLabel(label);
      if (normalizedLabel === candidate) return Number.parseInt(id, 10);
    }
  }

  for (const candidate of normalizedCandidates) {
    for (const [id, label] of Object.entries(genresById)) {
      const normalizedLabel = normalizeGenreLabel(label);
      if (
        normalizedLabel.includes(candidate) ||
        candidate.includes(normalizedLabel)
      ) {
        return Number.parseInt(id, 10);
      }
    }
  }

  return null;
}

function addTagAliases(value: string, bucket: Set<string>): void {
  if (value === 'sci fi' || value === 'scifi') {
    bucket.add('science fiction');
    bucket.add('sci fi fantasy');
  }
  if (value === 'science fiction') {
    bucket.add('sci fi');
    bucket.add('sci fi fantasy');
  }
  if (value === 'action') bucket.add('action adventure');
  if (value === 'fantasy') bucket.add('sci fi fantasy');
}

export function normalizeGenreLabel(value: string): string {
  return sharedNormalizeLabel(value);
}

export function dedupeSeriesEpisodes(
  episodes: TmdbSeriesEpisode[],
): TmdbSeriesEpisode[] {
  const deduped = new Map<string, TmdbSeriesEpisode>();

  for (const episode of episodes) {
    const key = `${episode.seasonNumber}:${episode.episodeNumber}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, episode);
      continue;
    }
    deduped.set(key, {
      seasonNumber: existing.seasonNumber,
      episodeNumber: existing.episodeNumber,
      title: existing.title || episode.title,
      airedAt: existing.airedAt ?? episode.airedAt,
      synopsis: existing.synopsis ?? episode.synopsis,
    });
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.seasonNumber !== right.seasonNumber) {
      return left.seasonNumber - right.seasonNumber;
    }
    return left.episodeNumber - right.episodeNumber;
  });
}
