import type {
  TmdbDiscoverInput,
  TmdbRemoteCandidate,
  TmdbSearchResponse,
} from './tmdb-metadata.types';
import { extractNumericId, toCandidate } from './tmdb-candidate-utils.helper';

interface TmdbDiscoverContext {
  cacheProvider: string;
  posterImageBaseUrl: string;
  backdropImageBaseUrl: string;
  metadataApiCacheStore: {
    get<T>(provider: string, key: string): Promise<T | undefined>;
    set<T>(provider: string, key: string, payload: T): Promise<void>;
  };
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
}

export async function discoverRemoteCandidatesValue(
  context: TmdbDiscoverContext,
  input: TmdbDiscoverInput,
): Promise<TmdbRemoteCandidate[]> {
  const results: TmdbRemoteCandidate[] = [];
  const perPage = 20;
  const maxPages = Math.max(1, Math.min(25, Math.ceil(input.limit / perPage)));
  const requestedPage = normalizeRequestedPage(input.page);
  const startPage = requestedPage ?? 1;
  const endPage = requestedPage ?? maxPages;

  for (let page = startPage; page <= endPage; page += 1) {
    const params = new URLSearchParams({
      include_adult: 'false',
      include_video: 'false',
      sort_by: 'popularity.desc',
      with_genres: String(input.genreId),
      page: String(page),
    });

    const payload = await loadDiscoverPage(context, input, page, params);

    const rawResults = Array.isArray(payload.results) ? payload.results : [];
    if (rawResults.length === 0) break;

    for (const raw of rawResults) {
      const candidate = toRemoteDiscoverCandidate(context, input, raw);
      if (!candidate) continue;
      results.push(candidate);

      if (results.length >= input.limit) return results;
    }
  }

  return results;
}

function normalizeRequestedPage(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : null;
}

async function loadDiscoverPage(
  context: TmdbDiscoverContext,
  input: TmdbDiscoverInput,
  page: number,
  params: URLSearchParams,
): Promise<TmdbSearchResponse> {
  const requestKey = `remote:discover:${input.endpoint}:genre:${input.genreId}:page:${page}`;
  if (input.useCache) {
    const cached = await context.metadataApiCacheStore.get<TmdbSearchResponse>(
      context.cacheProvider,
      requestKey,
    );
    if (cached !== undefined) return cached;
  }
  const requestParams = new URLSearchParams(params);
  requestParams.set('api_key', input.apiKey);
  const url = `https://api.themoviedb.org/3/discover/${input.endpoint}?${requestParams.toString()}`;
  const payload = (await context.fetchJson(url, 15000)) as TmdbSearchResponse;
  if (input.useCache) {
    await context.metadataApiCacheStore.set(
      context.cacheProvider,
      requestKey,
      payload,
    );
  }
  return payload;
}

function toRemoteDiscoverCandidate(
  context: TmdbDiscoverContext,
  input: TmdbDiscoverInput,
  raw: unknown,
): TmdbRemoteCandidate | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return null;
  const value = raw as Record<string, unknown>;
  const providerId = extractNumericId(value.id);
  if (!providerId) return null;
  const candidate = toCandidate(
    value,
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
    runtimeSeconds: null,
  };
}
