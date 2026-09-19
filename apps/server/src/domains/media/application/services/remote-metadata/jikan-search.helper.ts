import type {
  JikanLookupInput,
  JikanLookupResult,
  JikanRemoteCandidate,
  JikanSearchResponse,
  JikanDetailsResponse,
} from './jikan-metadata.types';
import {
  extractProviderId,
  filterExactTitleCandidates,
  pickBestCandidate,
  toCandidate,
  toRemoteCandidate,
} from './jikan-candidate-utils.helper';
import { JikanRateLimitError } from './jikan-rate-limit.helper';

export interface JikanSearchContext {
  cacheProvider: string;
  cache: Map<string, JikanLookupResult | null>;
  metadataApiCacheStore: {
    get<T>(provider: string, key: string): Promise<T | undefined>;
    set<T>(provider: string, key: string, payload: T): Promise<void>;
  };
  isRateLimited: () => boolean;
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
  applyRateLimitCooldown: (
    requestedCooldownMs: number,
    attemptedTitle: string,
  ) => void;
  logger: { warn(message: string): void };
  resolveGenreId: (tag: string, useCache: boolean) => Promise<number | null>;
}

export function cacheKey(title: string, releaseYear: number | null): string {
  return `${title.toLowerCase()}:${releaseYear ?? 0}`;
}

export async function lookupValue(
  context: JikanSearchContext,
  input: JikanLookupInput,
): Promise<JikanLookupResult | null> {
  const cleanedTitle = input.title.trim();
  if (!cleanedTitle) return null;

  const key = cacheKey(cleanedTitle, input.releaseYear);
  if (context.cache.has(key)) {
    return context.cache.get(key) ?? null;
  }

  if (context.isRateLimited()) {
    return null;
  }

  try {
    const result = await searchJikanValue(context, {
      title: cleanedTitle,
      releaseYear: input.releaseYear,
    });

    context.cache.set(key, result);
    return result;
  } catch (error) {
    if (error instanceof JikanRateLimitError) {
      context.applyRateLimitCooldown(error.retryAfterMs, cleanedTitle);
      return null;
    }

    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `Jikan lookup failed for "${cleanedTitle}": ${message}`,
    );
    context.cache.delete(key);
    return null;
  }
}

export async function searchCandidatesValue(
  context: JikanSearchContext,
  input: { title: string; limit?: number; useCache?: boolean },
): Promise<JikanRemoteCandidate[]> {
  const cleanedTitle = input.title.trim();
  if (cleanedTitle.length < 2) return [];

  if (context.isRateLimited()) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 16, 25));
  const useCache = input.useCache !== false;
  const params = new URLSearchParams({
    q: cleanedTitle,
    limit: String(Math.max(limit, 10)),
    sfw: 'true',
  });
  const requestKey = `remote:search:${params.toString()}`;

  try {
    let payload: JikanSearchResponse | undefined;

    if (useCache) {
      payload = await context.metadataApiCacheStore.get<JikanSearchResponse>(
        context.cacheProvider,
        requestKey,
      );
    }

    if (payload === undefined) {
      const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as JikanSearchResponse;

      if (useCache) {
        await context.metadataApiCacheStore.set(
          context.cacheProvider,
          requestKey,
          payload,
        );
      }
    }

    const rawResults = Array.isArray(payload.data) ? payload.data : [];
    const candidates: JikanRemoteCandidate[] = [];

    for (const raw of rawResults) {
      const candidate = toRemoteCandidate(raw);
      if (!candidate) continue;

      candidates.push(candidate);
      if (candidates.length >= limit) break;
    }

    return candidates;
  } catch (error) {
    if (error instanceof JikanRateLimitError) {
      context.applyRateLimitCooldown(error.retryAfterMs, cleanedTitle);
      return [];
    }

    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `Jikan remote search failed for "${cleanedTitle}": ${message}`,
    );
    return [];
  }
}

export async function searchCandidatesByTagValue(
  context: JikanSearchContext,
  input: { tag: string; limit?: number; page?: number; useCache?: boolean },
): Promise<JikanRemoteCandidate[]> {
  const cleanedTag = input.tag.trim();
  if (cleanedTag.length < 2) return [];

  if (context.isRateLimited()) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 30, 120));
  const requestedPage = normalizePage(input.page);
  const useCache = input.useCache !== false;
  const genreId = await context.resolveGenreId(cleanedTag, useCache);
  if (!genreId) return [];

  const deduped = new Map<string, JikanRemoteCandidate>();
  const maxPages = requestedPage
    ? requestedPage
    : Math.max(1, Math.min(12, Math.ceil(limit / 25)));
  const startPage = requestedPage ?? 1;

  try {
    for (let page = startPage; page <= maxPages; page += 1) {
      const pageLimit = Math.max(10, Math.min(25, limit - deduped.size));
      const params = new URLSearchParams({
        genres: String(genreId),
        limit: String(pageLimit),
        page: String(page),
        sfw: 'true',
        order_by: 'popularity',
        sort: 'asc',
      });
      const requestKey = `remote:tag:${params.toString()}`;

      const payload = await loadTagSearchPage(
        context,
        params,
        requestKey,
        useCache,
      );

      const rawResults = Array.isArray(payload.data) ? payload.data : [];
      if (rawResults.length === 0) break;

      addUniqueCandidates(deduped, rawResults);
      if (deduped.size >= limit) {
        return [...deduped.values()].slice(0, limit);
      }
    }

    return [...deduped.values()].slice(0, limit);
  } catch (error) {
    if (error instanceof JikanRateLimitError) {
      context.applyRateLimitCooldown(error.retryAfterMs, cleanedTag);
      return [];
    }

    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `Jikan remote tag search failed for "${cleanedTag}": ${message}`,
    );
    return [];
  }
}

function normalizePage(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : null;
}

async function loadTagSearchPage(
  context: JikanSearchContext,
  params: URLSearchParams,
  requestKey: string,
  useCache: boolean,
): Promise<JikanSearchResponse> {
  if (useCache) {
    const cached = await context.metadataApiCacheStore.get<JikanSearchResponse>(
      context.cacheProvider,
      requestKey,
    );
    if (cached !== undefined) return cached;
  }
  const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
  const payload = (await context.fetchJson(url, 15000)) as JikanSearchResponse;
  if (useCache) {
    await context.metadataApiCacheStore.set(
      context.cacheProvider,
      requestKey,
      payload,
    );
  }
  return payload;
}

function addUniqueCandidates(
  target: Map<string, JikanRemoteCandidate>,
  rawResults: unknown[],
): void {
  for (const raw of rawResults) {
    const candidate = toRemoteCandidate(raw);
    if (!candidate) continue;
    const key = `${candidate.mediaType}:${candidate.providerId}`;
    if (!target.has(key)) target.set(key, candidate);
  }
}

export async function getRemoteDetailsValue(
  context: JikanSearchContext,
  providerId: string,
): Promise<JikanRemoteCandidate | null> {
  const resolvedId = extractProviderId({ mal_id: providerId });
  if (!resolvedId) return null;

  if (context.isRateLimited()) return null;

  const requestKey = `remote:details:${resolvedId}`;

  try {
    const cachedPayload =
      await context.metadataApiCacheStore.get<JikanDetailsResponse>(
        context.cacheProvider,
        requestKey,
      );

    let payload: JikanDetailsResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const url = `https://api.jikan.moe/v4/anime/${resolvedId}/full`;
      payload = (await context.fetchJson(url, 15000)) as JikanDetailsResponse;
      await context.metadataApiCacheStore.set(
        context.cacheProvider,
        requestKey,
        payload,
      );
    }

    return toRemoteCandidate(payload.data);
  } catch (error) {
    if (error instanceof JikanRateLimitError) {
      context.applyRateLimitCooldown(error.retryAfterMs, `id:${resolvedId}`);
      return null;
    }

    const message = error instanceof Error ? error.message : String(error);
    context.logger.warn(
      `Jikan remote details lookup failed for ${resolvedId}: ${message}`,
    );
    return null;
  }
}

async function searchJikanValue(
  context: JikanSearchContext,
  input: JikanLookupInput,
): Promise<JikanLookupResult | null> {
  const params = new URLSearchParams({
    q: input.title,
    limit: '10',
    sfw: 'true',
  });

  const requestKey = params.toString();
  const cachedPayload =
    await context.metadataApiCacheStore.get<JikanSearchResponse>(
      context.cacheProvider,
      requestKey,
    );

  let payload: JikanSearchResponse;
  if (cachedPayload !== undefined) {
    payload = cachedPayload;
  } else {
    const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
    payload = (await context.fetchJson(url, 15000)) as JikanSearchResponse;
    await context.metadataApiCacheStore.set(
      context.cacheProvider,
      requestKey,
      payload,
    );
  }

  const rawResults = Array.isArray(payload.data) ? payload.data : [];
  const candidates = rawResults
    .map((item) => toCandidate(item))
    .filter(
      (candidate): candidate is NonNullable<ReturnType<typeof toCandidate>> =>
        candidate !== null,
    );

  const exactCandidates = filterExactTitleCandidates(candidates, input);
  if (exactCandidates.length === 0) return null;

  const picked = pickBestCandidate(exactCandidates, input.releaseYear);
  return {
    providerId: picked.providerId,
    mediaType: picked.mediaType,
    title: picked.title,
    tags: picked.tags,
    overview: picked.overview,
    releaseYear: picked.releaseYear,
    posterUrl: picked.posterUrl,
    backdropUrl: picked.backdropUrl,
  };
}
