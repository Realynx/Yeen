import type {
  JikanEpisodesResponse,
  JikanSeriesEpisode,
  JikanSeriesEpisodeCatalog,
} from './jikan-metadata.types';
import {
  dedupeSeriesEpisodes,
  extractSeriesEpisodes,
  hasNextEpisodePage,
  normalizeSeriesEpisodeCatalog,
} from './jikan-candidate-utils.helper';
import { JikanRateLimitError } from './jikan-rate-limit.helper';

export interface JikanSeriesContext {
  cacheProvider: string;
  metadataApiCacheStore: {
    get<T>(provider: string, key: string): Promise<T | undefined>;
    set<T>(provider: string, key: string, payload: T): Promise<void>;
  };
  seriesCatalogInFlight: Map<string, Promise<JikanSeriesEpisodeCatalog | null>>;
  isRateLimited: () => boolean;
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
  applyRateLimitCooldown: (requestedCooldownMs: number, attemptedTitle: string) => void;
  logger: { warn(message: string): void };
}

export async function getSeriesEpisodeCatalogValue(
  context: JikanSeriesContext,
  providerId: string,
  options?: { useCache?: boolean },
): Promise<JikanSeriesEpisodeCatalog | null> {
  const resolvedId = providerId.trim();
  if (!resolvedId) return null;

  const useCache = options?.useCache !== false;
  const requestKey = `series-episodes:${resolvedId}:v1`;

  if (useCache) {
    const cachedCatalog = await context.metadataApiCacheStore.get<JikanSeriesEpisodeCatalog>(
      context.cacheProvider,
      requestKey,
    );
    if (cachedCatalog) {
      const normalized = normalizeSeriesEpisodeCatalog(cachedCatalog);
      if (normalized) return normalized;
    }
  }

  const inFlight = context.seriesCatalogInFlight.get(resolvedId);
  if (inFlight) return inFlight;

  const loadPromise = loadSeriesEpisodeCatalog(context, resolvedId, useCache)
    .catch((error) => {
      if (error instanceof JikanRateLimitError) {
        context.applyRateLimitCooldown(error.retryAfterMs, `id:${resolvedId}`);
        return null;
      }

      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn(
        `Jikan series episode catalog lookup failed for ${resolvedId}: ${message}`,
      );
      return null;
    })
    .finally(() => {
      context.seriesCatalogInFlight.delete(resolvedId);
    });

  context.seriesCatalogInFlight.set(resolvedId, loadPromise);
  return loadPromise;
}

async function loadSeriesEpisodeCatalog(
  context: JikanSeriesContext,
  resolvedId: string,
  useCache: boolean,
): Promise<JikanSeriesEpisodeCatalog | null> {
  if (context.isRateLimited()) {
    return null;
  }

  const episodes: JikanSeriesEpisode[] = [];
  let page = 1;
  const maxPages = 200;

  while (page <= maxPages) {
    const params = new URLSearchParams({ page: String(page) });
    const requestKey = `series-episodes:${resolvedId}:page:${page}`;

    let payload: JikanEpisodesResponse | undefined;
    if (useCache) {
      payload = await context.metadataApiCacheStore.get<JikanEpisodesResponse>(
        context.cacheProvider,
        requestKey,
      );
    }

    if (payload === undefined) {
      const url = `https://api.jikan.moe/v4/anime/${resolvedId}/episodes?${params.toString()}`;
      payload = (await context.fetchJson(url, 15000)) as JikanEpisodesResponse;

      if (useCache) {
        await context.metadataApiCacheStore.set(context.cacheProvider, requestKey, payload);
      }
    }

    const pageEpisodes = extractSeriesEpisodes(payload.data);
    if (pageEpisodes.length > 0) {
      episodes.push(...pageEpisodes);
    }

    if (!hasNextEpisodePage(payload.pagination, page)) {
      break;
    }

    page += 1;
  }

  const normalizedEpisodes = dedupeSeriesEpisodes(episodes);
  if (normalizedEpisodes.length === 0) {
    return null;
  }

  const catalog: JikanSeriesEpisodeCatalog = {
    providerId: resolvedId,
    totalEpisodeCount: normalizedEpisodes.length,
    episodes: normalizedEpisodes,
    updatedAt: new Date().toISOString(),
  };

  await context.metadataApiCacheStore.set(
    context.cacheProvider,
    `series-episodes:${resolvedId}:v1`,
    catalog,
  );

  return catalog;
}
