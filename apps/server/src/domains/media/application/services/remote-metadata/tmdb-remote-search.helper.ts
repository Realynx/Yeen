import {
  TMDB_MOVIE_GENRES_BY_ID,
  TMDB_SHOW_GENRES_BY_ID,
  type TmdbDetailsResponse,
  type TmdbDiscoverInput,
  type TmdbLookupInput,
  type TmdbLookupResult,
  type TmdbRemoteCandidate,
  type TmdbSearchCandidate,
  type TmdbSearchResponse,
} from './tmdb-metadata.types';
import {
  endpointForType,
  extractNumericId,
  extractRuntimeSeconds,
  normalizeGenreLabel,
  resolveCandidateMediaType,
  resolveGenreId,
  resolveTmdbSourceId,
  toCandidate,
} from './tmdb-candidate-utils.helper';
import { discoverRemoteCandidatesValue } from './tmdb-discover.helper';
import { searchTmdbValue } from './tmdb-search-exact.helper';

export interface TmdbSearchContext {
  cacheProvider: string;
  logger: { warn(message: string): void };
  posterImageBaseUrl: string;
  backdropImageBaseUrl: string;
  getApiKey: () => Promise<string | null>;
  metadataApiCacheStore: {
    get<T>(provider: string, key: string): Promise<T | undefined>;
    set<T>(provider: string, key: string, payload: T): Promise<void>;
  };
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
  cache: Map<string, TmdbLookupResult | null>;
}

export function cacheKey(
  mediaType: 'movie' | 'show' | 'other',
  title: string,
  releaseYear: number | null,
): string {
  return `${mediaType}:${title.toLowerCase()}:${releaseYear ?? 0}`;
}

export async function lookupValue(
  context: TmdbSearchContext,
  input: TmdbLookupInput,
): Promise<TmdbLookupResult | null> {
  const cleanedTitle = input.title.trim();
  if (!cleanedTitle) return null;

  const key = cacheKey(input.mediaType, cleanedTitle, input.releaseYear);
  if (context.cache.has(key)) {
    return context.cache.get(key) ?? null;
  }

  const apiKey = await context.getApiKey();
  if (!apiKey) {
    context.cache.set(key, null);
    return null;
  }

  try {
    const result = await searchTmdbValue(context, apiKey, {
      title: cleanedTitle,
      mediaType: input.mediaType,
      releaseYear: input.releaseYear,
    });
    context.cache.set(key, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(`TMDB lookup failed for "${cleanedTitle}": ${message}`);
    context.cache.delete(key);
    return null;
  }
}

export async function searchCandidatesValue(
  context: TmdbSearchContext,
  input: {
    title: string;
    mediaType: 'movie' | 'show' | 'other';
    releaseYear: number | null;
    limit?: number;
  },
): Promise<TmdbSearchCandidate[]> {
  const cleanedTitle = input.title.trim();
  if (cleanedTitle.length < 2) return [];

  const apiKey = await context.getApiKey();
  if (!apiKey) return [];

  const endpoint = endpointForType(input.mediaType);
  const params = new URLSearchParams({
    query: cleanedTitle,
    include_adult: 'false',
    page: '1',
  });

  if (input.mediaType === 'movie' && input.releaseYear) {
    params.set('year', String(input.releaseYear));
  }
  if (input.mediaType === 'show' && input.releaseYear) {
    params.set('first_air_date_year', String(input.releaseYear));
  }

  const requestKey = `${endpoint}?${params.toString()}`;

  try {
    const cachedPayload =
      await context.metadataApiCacheStore.get<TmdbSearchResponse>(
        context.cacheProvider,
        requestKey,
      );

    let payload: TmdbSearchResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const requestParams = new URLSearchParams(params);
      requestParams.set('api_key', apiKey);
      const url = `https://api.themoviedb.org/3/search/${endpoint}?${requestParams.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as TmdbSearchResponse;
      await context.metadataApiCacheStore.set(
        context.cacheProvider,
        requestKey,
        payload,
      );
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
    const candidates: TmdbSearchCandidate[] = [];

    for (const raw of results) {
      const candidate = toCandidate(
        raw,
        input.mediaType,
        context.posterImageBaseUrl,
        context.backdropImageBaseUrl,
      );
      if (!candidate) continue;

      const rawRecord = raw as Record<string, unknown>;
      const sourceId = resolveTmdbSourceId(rawRecord.id);
      if (!sourceId) continue;

      candidates.push({
        title: candidate.title,
        mediaType: resolveCandidateMediaType(rawRecord, input.mediaType),
        tags: candidate.tags,
        overview: candidate.overview,
        releaseYear: candidate.releaseYear,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        remoteSource: 'tmdb',
        remoteSourceId: sourceId,
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(`TMDB search failed for "${cleanedTitle}": ${message}`);
    return [];
  }
}

export async function searchRemoteCandidatesValue(
  context: TmdbSearchContext,
  input: { title: string; limit?: number; useCache?: boolean },
): Promise<TmdbRemoteCandidate[]> {
  const cleanedTitle = input.title.trim();
  if (cleanedTitle.length < 2) return [];

  const apiKey = await context.getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query: cleanedTitle,
    include_adult: 'false',
    page: '1',
  });
  const useCache = input.useCache !== false;
  const requestKey = `remote:multi?${params.toString()}`;

  try {
    let payload: TmdbSearchResponse | undefined;

    if (useCache) {
      payload = await context.metadataApiCacheStore.get<TmdbSearchResponse>(
        context.cacheProvider,
        requestKey,
      );
    }

    if (payload === undefined) {
      const requestParams = new URLSearchParams(params);
      requestParams.set('api_key', apiKey);
      const url = `https://api.themoviedb.org/3/search/multi?${requestParams.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as TmdbSearchResponse;

      if (useCache) {
        await context.metadataApiCacheStore.set(
          context.cacheProvider,
          requestKey,
          payload,
        );
      }
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const limit = Math.max(1, Math.min(input.limit ?? 16, 40));
    const candidates: TmdbRemoteCandidate[] = [];

    for (const raw of results) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        continue;

      const value = raw as Record<string, unknown>;
      const candidateType = resolveCandidateMediaType(value, 'other');
      if (candidateType !== 'movie' && candidateType !== 'show') continue;

      const providerId = extractNumericId(value.id);
      if (!providerId) continue;

      const candidate = toCandidate(
        value,
        'other',
        context.posterImageBaseUrl,
        context.backdropImageBaseUrl,
      );
      if (!candidate) continue;

      candidates.push({
        provider: 'tmdb',
        providerId,
        title: candidate.title,
        mediaType: candidateType,
        tags: candidate.tags,
        overview: candidate.overview,
        releaseYear: candidate.releaseYear,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        runtimeSeconds: null,
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `TMDB remote search failed for "${cleanedTitle}": ${message}`,
    );
    return [];
  }
}

export async function searchRemoteCandidatesByTagValue(
  context: TmdbSearchContext,
  input: { tag: string; limit?: number; page?: number; useCache?: boolean },
): Promise<TmdbRemoteCandidate[]> {
  const cleanedTag = input.tag.trim();
  if (cleanedTag.length < 2) return [];

  const apiKey = await context.getApiKey();
  if (!apiKey) return [];

  const normalizedTag = normalizeGenreLabel(cleanedTag);
  if (!normalizedTag) return [];

  const movieGenreId = resolveGenreId(normalizedTag, TMDB_MOVIE_GENRES_BY_ID);
  const showGenreId = resolveGenreId(normalizedTag, TMDB_SHOW_GENRES_BY_ID);
  if (!movieGenreId && !showGenreId) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 36, 120));
  const page =
    typeof input.page === 'number' && Number.isFinite(input.page)
      ? Math.max(1, Math.floor(input.page))
      : undefined;
  const useCache = input.useCache !== false;
  const targets: TmdbDiscoverInput[] = [];

  if (movieGenreId) {
    targets.push({
      apiKey,
      endpoint: 'movie',
      mediaType: 'movie',
      genreId: movieGenreId,
      limit,
      page,
      useCache,
    });
  }
  if (showGenreId) {
    targets.push({
      apiKey,
      endpoint: 'tv',
      mediaType: 'show',
      genreId: showGenreId,
      limit,
      page,
      useCache,
    });
  }

  const discoveredByTarget = await Promise.all(
    targets.map((target) => discoverRemoteCandidatesValue(context, target)),
  );

  const deduped = new Map<string, TmdbRemoteCandidate>();
  for (const candidate of discoveredByTarget.flat()) {
    const key = `${candidate.mediaType}:${candidate.providerId}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }

  return [...deduped.values()].slice(0, limit);
}

export async function getRemoteDetailsValue(
  context: TmdbSearchContext,
  input: { providerId: string; mediaType: 'movie' | 'show' },
): Promise<TmdbRemoteCandidate | null> {
  const providerId = extractNumericId(input.providerId);
  if (!providerId) return null;

  const apiKey = await context.getApiKey();
  if (!apiKey) return null;

  const endpoint = input.mediaType === 'show' ? 'tv' : 'movie';
  const requestKey = `remote:details:${endpoint}:${providerId}`;

  try {
    const cachedPayload =
      await context.metadataApiCacheStore.get<TmdbDetailsResponse>(
        context.cacheProvider,
        requestKey,
      );

    let payload: TmdbDetailsResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const params = new URLSearchParams({ api_key: apiKey });
      const url = `https://api.themoviedb.org/3/${endpoint}/${providerId}?${params.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as TmdbDetailsResponse;
      await context.metadataApiCacheStore.set(
        context.cacheProvider,
        requestKey,
        payload,
      );
    }

    const candidate = toCandidate(
      payload,
      input.mediaType,
      context.posterImageBaseUrl,
      context.backdropImageBaseUrl,
    );
    if (!candidate) return null;

    return {
      provider: 'tmdb',
      providerId,
      title: candidate.title,
      mediaType: input.mediaType,
      tags: candidate.tags,
      overview: candidate.overview,
      releaseYear: candidate.releaseYear,
      posterUrl: candidate.posterUrl,
      backdropUrl: candidate.backdropUrl,
      runtimeSeconds: extractRuntimeSeconds(payload, input.mediaType),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `TMDB remote details lookup failed for ${providerId}: ${message}`,
    );
    return null;
  }
}
