import {
  extractNumericStringId as sharedExtractNumericStringId,
  extractPositiveInteger as sharedExtractPositiveInteger,
  normalizeForExactMatch as sharedNormalizeForExactMatch,
  normalizeTags as sharedNormalizeTags,
} from './remote-metadata-normalization';
import type {
  JikanCandidate,
  JikanLookupInput,
  JikanRemoteCandidate,
  JikanSeriesEpisode,
  JikanSeriesEpisodeCatalog,
} from './jikan-metadata.types';

export function toCandidate(item: unknown): JikanCandidate | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }

  const value = item as Record<string, unknown>;
  const providerId = extractProviderId(value);
  if (!providerId) return null;

  const titlesForMatch = collectTitles(value);
  if (titlesForMatch.length === 0) return null;

  const preferredTitle =
    getTitleString(value.title_english) ??
    getTitleString(value.title) ??
    titlesForMatch[0];

  return {
    providerId,
    mediaType: resolveMediaType(value),
    title: preferredTitle,
    titlesForMatch,
    tags: extractTags(value),
    overview: getNullableString(value.synopsis),
    releaseYear: extractYear(value),
    posterUrl: extractPosterUrl(value),
    backdropUrl: extractBackdropUrl(value),
    score:
      typeof value.score === 'number' && Number.isFinite(value.score)
        ? value.score
        : null,
  };
}

function collectTitles(value: Record<string, unknown>): string[] {
  const titles = new Set<string>();
  addTitle(titles, value.title);
  addTitle(titles, value.title_english);
  addTitle(titles, value.title_japanese);

  if (Array.isArray(value.titles)) {
    for (const entry of value.titles) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }
      addTitle(titles, (entry as Record<string, unknown>).title);
    }
  }

  return [...titles];
}

function addTitle(titles: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const cleaned = value.trim();
  if (cleaned) titles.add(cleaned);
}

function extractTags(value: Record<string, unknown>): string[] {
  const tags: string[] = [];
  collectNamedTags(value.genres, tags);
  collectNamedTags(value.explicit_genres, tags);
  collectNamedTags(value.themes, tags);
  collectNamedTags(value.demographics, tags);
  return sharedNormalizeTags(tags);
}

function collectNamedTags(source: unknown, bucket: string[]): void {
  if (!Array.isArray(source)) return;

  for (const entry of source) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const name = getTitleString((entry as Record<string, unknown>).name);
    if (name) bucket.push(name);
  }
}

export function filterExactTitleCandidates(
  candidates: JikanCandidate[],
  input: JikanLookupInput,
): JikanCandidate[] {
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

export function pickBestCandidate(
  candidates: JikanCandidate[],
  releaseYear: number | null,
): JikanCandidate {
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const yearScore =
      releaseYear && candidate.releaseYear
        ? releaseYear === candidate.releaseYear
          ? 0.9
          : 0
        : 0;
    const qualityScore = candidate.score ? candidate.score / 10 : 0;
    const posterScore = candidate.posterUrl ? 0.15 : 0;
    const backdropScore = candidate.backdropUrl ? 0.08 : 0;
    const detailScore = candidate.overview ? 0.08 : 0;
    const score =
      yearScore + qualityScore + posterScore + backdropScore + detailScore;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function getTitleString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function getNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function extractYear(value: Record<string, unknown>): number | null {
  if (typeof value.year === 'number' && Number.isFinite(value.year)) {
    return Math.trunc(value.year);
  }

  const aired = value.aired;
  if (
    typeof aired === 'object' &&
    aired !== null &&
    !Array.isArray(aired) &&
    typeof (aired as Record<string, unknown>).from === 'string'
  ) {
    const from = (aired as Record<string, unknown>).from as string;
    const match = from.match(/^(\d{4})/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function extractPosterUrl(value: Record<string, unknown>): string | null {
  const images =
    typeof value.images === 'object' &&
    value.images !== null &&
    !Array.isArray(value.images)
      ? (value.images as Record<string, unknown>)
      : null;
  if (!images) return null;

  const jpg =
    typeof images.jpg === 'object' &&
    images.jpg !== null &&
    !Array.isArray(images.jpg)
      ? (images.jpg as Record<string, unknown>)
      : null;
  const webp =
    typeof images.webp === 'object' &&
    images.webp !== null &&
    !Array.isArray(images.webp)
      ? (images.webp as Record<string, unknown>)
      : null;

  return (
    getTitleString(jpg?.large_image_url) ??
    getTitleString(jpg?.image_url) ??
    getTitleString(webp?.large_image_url) ??
    getTitleString(webp?.image_url) ??
    null
  );
}

function extractBackdropUrl(value: Record<string, unknown>): string | null {
  const trailer =
    typeof value.trailer === 'object' &&
    value.trailer !== null &&
    !Array.isArray(value.trailer)
      ? (value.trailer as Record<string, unknown>)
      : null;
  const images =
    trailer &&
    typeof trailer.images === 'object' &&
    trailer.images !== null &&
    !Array.isArray(trailer.images)
      ? (trailer.images as Record<string, unknown>)
      : null;

  return (
    getTitleString(images?.maximum_image_url) ??
    getTitleString(images?.large_image_url) ??
    getTitleString(images?.medium_image_url) ??
    getTitleString(images?.small_image_url) ??
    getTitleString(images?.image_url) ??
    null
  );
}

export function toRemoteCandidate(item: unknown): JikanRemoteCandidate | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }

  const value = item as Record<string, unknown>;
  const providerId = extractProviderId(value);
  if (!providerId) return null;

  const base = toCandidate(value);
  if (!base) return null;

  return {
    provider: 'jikan',
    providerId,
    title: base.title,
    mediaType: resolveMediaType(value),
    tags: base.tags,
    overview: base.overview,
    releaseYear: base.releaseYear,
    posterUrl: base.posterUrl,
    backdropUrl: base.backdropUrl,
    runtimeSeconds: extractDurationSeconds(value),
  };
}

function resolveMediaType(value: Record<string, unknown>): 'movie' | 'show' {
  const type =
    typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
  return type === 'movie' ? 'movie' : 'show';
}

export function extractProviderId(
  value: Record<string, unknown>,
): string | null {
  return sharedExtractNumericStringId(value.mal_id);
}

function extractDurationSeconds(value: Record<string, unknown>): number | null {
  const duration =
    typeof value.duration === 'string'
      ? value.duration.trim().toLowerCase()
      : '';
  if (!duration) return null;

  const hourMatch = duration.match(/(\d+)\s*(?:hour|hr|h)/);
  const minuteMatch = duration.match(/(\d+)\s*(?:minute|min|m)/);

  const hours = hourMatch ? Number.parseInt(hourMatch[1], 10) : 0;
  const minutes = minuteMatch ? Number.parseInt(minuteMatch[1], 10) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const totalMinutes = Math.max(0, hours) * 60 + Math.max(0, minutes);
  return totalMinutes > 0 ? totalMinutes * 60 : null;
}

export function normalizeSeriesEpisodeCatalog(
  value: unknown,
): JikanSeriesEpisodeCatalog | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const providerId = extractProviderId({ mal_id: source.providerId });
  if (!providerId) return null;

  const episodes = extractSeriesEpisodes(source.episodes);
  if (episodes.length === 0) return null;

  const normalizedEpisodes = dedupeSeriesEpisodes(episodes);
  const totalEpisodeCount = sharedExtractPositiveInteger(
    source.totalEpisodeCount,
  );
  const updatedAt = getNullableString(source.updatedAt);

  return {
    providerId,
    totalEpisodeCount: totalEpisodeCount ?? normalizedEpisodes.length,
    episodes: normalizedEpisodes,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

export function extractSeriesEpisodes(value: unknown): JikanSeriesEpisode[] {
  if (!Array.isArray(value)) return [];

  const episodes: JikanSeriesEpisode[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const row = entry as Record<string, unknown>;
    const episodeNumber = sharedExtractPositiveInteger(row.mal_id);
    if (!episodeNumber) continue;

    const title =
      getTitleString(row.title) ??
      getTitleString(row.title_romanji) ??
      getTitleString(row.title_japanese) ??
      `Episode ${episodeNumber}`;
    const airedAt =
      getNullableString(row.aired) ?? getNullableString(row.premiered) ?? null;
    const synopsis =
      getNullableString(row.synopsis) ??
      getNullableString(row.description) ??
      null;

    episodes.push({ episodeNumber, title, airedAt, synopsis });
  }

  return episodes;
}

export function dedupeSeriesEpisodes(
  episodes: JikanSeriesEpisode[],
): JikanSeriesEpisode[] {
  const deduped = new Map<number, JikanSeriesEpisode>();

  for (const episode of episodes) {
    const existing = deduped.get(episode.episodeNumber);
    if (!existing) {
      deduped.set(episode.episodeNumber, episode);
      continue;
    }

    deduped.set(episode.episodeNumber, {
      episodeNumber: existing.episodeNumber,
      title: existing.title || episode.title,
      airedAt: existing.airedAt ?? episode.airedAt,
      synopsis: existing.synopsis ?? episode.synopsis,
    });
  }

  return [...deduped.values()].sort(
    (left, right) => left.episodeNumber - right.episodeNumber,
  );
}

export function hasNextEpisodePage(
  pagination: unknown,
  currentPage: number,
): boolean {
  if (
    typeof pagination !== 'object' ||
    pagination === null ||
    Array.isArray(pagination)
  ) {
    return false;
  }

  const value = pagination as Record<string, unknown>;
  if (value.has_next_page === true) return true;

  const lastVisiblePage = sharedExtractPositiveInteger(value.last_visible_page);
  if (lastVisiblePage && currentPage < lastVisiblePage) return true;

  return false;
}
