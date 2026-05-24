import { extractPositiveInteger as sharedExtractPositiveInteger } from './remote-metadata-normalization';
import {
  dedupeSeriesEpisodes,
  extractNumericId,
} from './tmdb-candidate-utils.helper';
import type {
  TmdbDetailsResponse,
  TmdbSeasonDetailsResponse,
  TmdbSeriesEpisode,
  TmdbSeriesEpisodeCatalog,
} from './tmdb-metadata.types';

interface TmdbSeriesCatalogContext {
  cacheProvider: string;
  metadataApiCacheStore: {
    get<T>(provider: string, key: string): Promise<T | undefined>;
    set<T>(provider: string, key: string, payload: T): Promise<void>;
  };
  seriesCatalogInFlight: Map<string, Promise<TmdbSeriesEpisodeCatalog | null>>;
  getApiKey: () => Promise<string | null>;
  fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
}

export async function getSeriesEpisodeCatalogValue(
  context: TmdbSeriesCatalogContext,
  providerId: string,
  options?: { useCache?: boolean },
): Promise<TmdbSeriesEpisodeCatalog | null> {
  const resolvedId = extractNumericId(providerId);
  if (!resolvedId) return null;

  const apiKey = await context.getApiKey();
  if (!apiKey) return null;

  const useCache = options?.useCache !== false;
  const requestKey = `series-episodes:${resolvedId}:v1`;

  if (useCache) {
    const cachedCatalog =
      await context.metadataApiCacheStore.get<TmdbSeriesEpisodeCatalog>(
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

  const loadPromise = loadSeriesEpisodeCatalog(
    context,
    resolvedId,
    apiKey,
    useCache,
  ).finally(() => {
    context.seriesCatalogInFlight.delete(resolvedId);
  });

  context.seriesCatalogInFlight.set(resolvedId, loadPromise);
  return loadPromise;
}

async function loadSeriesEpisodeCatalog(
  context: TmdbSeriesCatalogContext,
  resolvedId: string,
  apiKey: string,
  useCache: boolean,
): Promise<TmdbSeriesEpisodeCatalog | null> {
  const detailsKey = `series-episodes:${resolvedId}:details`;
  let detailsPayload: TmdbDetailsResponse | undefined;

  if (useCache) {
    detailsPayload =
      await context.metadataApiCacheStore.get<TmdbDetailsResponse>(
        context.cacheProvider,
        detailsKey,
      );
  }

  if (detailsPayload === undefined) {
    const detailsParams = new URLSearchParams({ api_key: apiKey });
    const detailsUrl = `https://api.themoviedb.org/3/tv/${resolvedId}?${detailsParams.toString()}`;
    detailsPayload = (await context.fetchJson(
      detailsUrl,
      15000,
    )) as TmdbDetailsResponse;

    if (useCache) {
      await context.metadataApiCacheStore.set(
        context.cacheProvider,
        detailsKey,
        detailsPayload,
      );
    }
  }

  const seasonNumbers = resolveSeriesSeasonNumbers(detailsPayload);
  if (seasonNumbers.length === 0) return null;

  const episodes: TmdbSeriesEpisode[] = [];

  for (const seasonNumber of seasonNumbers) {
    const seasonKey = `series-episodes:${resolvedId}:season:${seasonNumber}`;
    let seasonPayload: TmdbSeasonDetailsResponse | undefined;

    if (useCache) {
      seasonPayload =
        await context.metadataApiCacheStore.get<TmdbSeasonDetailsResponse>(
          context.cacheProvider,
          seasonKey,
        );
    }

    if (seasonPayload === undefined) {
      const seasonParams = new URLSearchParams({ api_key: apiKey });
      const seasonUrl = `https://api.themoviedb.org/3/tv/${resolvedId}/season/${seasonNumber}?${seasonParams.toString()}`;
      seasonPayload = (await context.fetchJson(
        seasonUrl,
        15000,
      )) as TmdbSeasonDetailsResponse;

      if (useCache) {
        await context.metadataApiCacheStore.set(
          context.cacheProvider,
          seasonKey,
          seasonPayload,
        );
      }
    }

    episodes.push(...extractSeasonEpisodes(seasonPayload, seasonNumber));
  }

  const normalizedEpisodes = dedupeSeriesEpisodes(episodes);
  if (normalizedEpisodes.length === 0) return null;

  const catalog: TmdbSeriesEpisodeCatalog = {
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

function resolveSeriesSeasonNumbers(value: unknown): number[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }

  const details = value as Record<string, unknown>;
  const fromSeasons = new Set<number>();

  if (Array.isArray(details.seasons)) {
    for (const season of details.seasons) {
      if (
        typeof season !== 'object' ||
        season === null ||
        Array.isArray(season)
      ) {
        continue;
      }

      const seasonNumber = sharedExtractPositiveInteger(
        (season as Record<string, unknown>).season_number,
      );
      if (!seasonNumber) continue;
      fromSeasons.add(seasonNumber);
    }
  }

  if (fromSeasons.size > 0) {
    return [...fromSeasons].sort((left, right) => left - right);
  }

  const seasonCount = sharedExtractPositiveInteger(details.number_of_seasons);
  if (!seasonCount) return [];

  const cappedCount = Math.min(seasonCount, 80);
  const seasonNumbers: number[] = [];
  for (let season = 1; season <= cappedCount; season += 1) {
    seasonNumbers.push(season);
  }

  return seasonNumbers;
}

function extractSeasonEpisodes(
  value: unknown,
  fallbackSeasonNumber: number,
): TmdbSeriesEpisode[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }

  const payload = value as Record<string, unknown>;
  const seasonNumber =
    sharedExtractPositiveInteger(payload.season_number) ?? fallbackSeasonNumber;
  const rawEpisodes = Array.isArray(payload.episodes) ? payload.episodes : [];
  const episodes: TmdbSeriesEpisode[] = [];

  for (const rawEpisode of rawEpisodes) {
    if (
      typeof rawEpisode !== 'object' ||
      rawEpisode === null ||
      Array.isArray(rawEpisode)
    ) {
      continue;
    }

    const row = rawEpisode as Record<string, unknown>;
    const episodeNumber = sharedExtractPositiveInteger(row.episode_number);
    if (!episodeNumber) continue;

    const title =
      typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name.trim()
        : `Episode ${episodeNumber}`;
    const airedAt =
      typeof row.air_date === 'string' && row.air_date.trim().length > 0
        ? row.air_date.trim()
        : null;
    const synopsis =
      typeof row.overview === 'string' && row.overview.trim().length > 0
        ? row.overview.trim()
        : null;

    episodes.push({ seasonNumber, episodeNumber, title, airedAt, synopsis });
  }

  return episodes;
}

function normalizeSeriesEpisodeCatalog(
  value: unknown,
): TmdbSeriesEpisodeCatalog | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const providerId = extractNumericId(source.providerId);
  if (!providerId) return null;

  const rawEpisodes = Array.isArray(source.episodes) ? source.episodes : [];
  const episodes = rawEpisodes
    .map((entry) => toSeriesEpisode(entry))
    .filter((entry): entry is TmdbSeriesEpisode => entry !== null);
  const normalizedEpisodes = dedupeSeriesEpisodes(episodes);
  if (normalizedEpisodes.length === 0) return null;

  const totalEpisodeCount =
    sharedExtractPositiveInteger(source.totalEpisodeCount) ??
    normalizedEpisodes.length;
  const updatedAt =
    typeof source.updatedAt === 'string' && source.updatedAt.trim().length > 0
      ? source.updatedAt.trim()
      : new Date().toISOString();

  return {
    providerId,
    totalEpisodeCount,
    episodes: normalizedEpisodes,
    updatedAt,
  };
}

function toSeriesEpisode(value: unknown): TmdbSeriesEpisode | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const seasonNumber = sharedExtractPositiveInteger(row.seasonNumber);
  const episodeNumber = sharedExtractPositiveInteger(row.episodeNumber);
  if (!seasonNumber || !episodeNumber) return null;

  const title =
    typeof row.title === 'string' && row.title.trim().length > 0
      ? row.title.trim()
      : `Episode ${episodeNumber}`;
  const airedAt =
    typeof row.airedAt === 'string' && row.airedAt.trim().length > 0
      ? row.airedAt.trim()
      : null;
  const synopsis =
    typeof row.synopsis === 'string' && row.synopsis.trim().length > 0
      ? row.synopsis.trim()
      : null;

  return { seasonNumber, episodeNumber, title, airedAt, synopsis };
}
