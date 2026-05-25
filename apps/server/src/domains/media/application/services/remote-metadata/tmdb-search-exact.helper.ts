import type {
  TmdbCandidate,
  TmdbLookupInput,
  TmdbLookupResult,
  TmdbSearchResponse,
} from './tmdb-metadata.types';
import {
  endpointForType,
  extractNumericId,
  filterExactTitleCandidates,
  pickBestCandidate,
  toCandidate,
} from './tmdb-candidate-utils.helper';
import type { TmdbSearchContext } from './tmdb-remote-search.helper';

export async function searchTmdbValue(
  context: TmdbSearchContext,
  apiKey: string,
  input: TmdbLookupInput,
): Promise<TmdbLookupResult | null> {
  const endpoint = endpointForType(input.mediaType);
  const params = new URLSearchParams({
    query: input.title,
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
  const candidates = results
    .map((item) => {
      const candidate = toCandidate(
        item,
        input.mediaType,
        context.posterImageBaseUrl,
        context.backdropImageBaseUrl,
      );
      if (!candidate) {
        return null;
      }

      const source =
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const providerId = extractNumericId(source?.id);
      if (!providerId) {
        return null;
      }

      return { ...candidate, providerId };
    })
    .filter(
      (candidate): candidate is TmdbCandidate & { providerId: string } =>
        candidate !== null,
    );

  const exactCandidates = filterExactTitleCandidates(candidates, input);
  if (exactCandidates.length === 0) {
    return null;
  }

  const picked = pickBestCandidate(exactCandidates, input);
  return {
    providerId: picked.providerId,
    title: picked.title,
    tags: picked.tags,
    overview: picked.overview,
    releaseYear: picked.releaseYear,
    posterUrl: picked.posterUrl,
    backdropUrl: picked.backdropUrl,
  };
}
