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
  const requestedPage =
    typeof input.page === 'number' && Number.isFinite(input.page)
      ? Math.max(1, Math.floor(input.page))
      : null;
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

    const requestKey = `remote:discover:${input.endpoint}:genre:${input.genreId}:page:${page}`;
    let payload: TmdbSearchResponse | undefined;

    if (input.useCache) {
      payload = await context.metadataApiCacheStore.get<TmdbSearchResponse>(
        context.cacheProvider,
        requestKey,
      );
    }

    if (payload === undefined) {
      const requestParams = new URLSearchParams(params);
      requestParams.set('api_key', input.apiKey);
      const url = `https://api.themoviedb.org/3/discover/${input.endpoint}?${requestParams.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as TmdbSearchResponse;

      if (input.useCache) {
        await context.metadataApiCacheStore.set(
          context.cacheProvider,
          requestKey,
          payload,
        );
      }
    }

    const rawResults = Array.isArray(payload.results) ? payload.results : [];
    if (rawResults.length === 0) break;

    for (const raw of rawResults) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        continue;

      const value = raw as Record<string, unknown>;
      const providerId = extractNumericId(value.id);
      if (!providerId) continue;

      const candidate = toCandidate(
        value,
        input.mediaType,
        context.posterImageBaseUrl,
        context.backdropImageBaseUrl,
      );
      if (!candidate) continue;

      results.push({
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
      });

      if (results.length >= input.limit) return results;
    }
  }

  return results;
}
