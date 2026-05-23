import { Injectable, Logger } from '@nestjs/common';
import { MetadataApiCacheStore } from '../../infrastructure/stores/metadata-api-cache.store';

class JikanRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'JikanRateLimitError';
  }
}

interface JikanSearchResponse {
  data?: unknown[];
}

interface JikanDetailsResponse {
  data?: unknown;
}

interface JikanEpisodesResponse {
  data?: unknown[];
  pagination?: unknown;
}

interface JikanGenreCatalogResponse {
  data?: unknown[];
}

interface JikanCandidate {
  providerId: string;
  mediaType: 'movie' | 'show';
  title: string;
  titlesForMatch: string[];
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  score: number | null;
}

interface JikanLookupInput {
  title: string;
  releaseYear: number | null;
}

export interface JikanLookupResult {
  providerId: string;
  mediaType: 'movie' | 'show';
  title: string;
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

export interface JikanSeriesEpisode {
  episodeNumber: number;
  title: string;
  airedAt: string | null;
  synopsis: string | null;
}

export interface JikanSeriesEpisodeCatalog {
  providerId: string;
  totalEpisodeCount: number;
  episodes: JikanSeriesEpisode[];
  updatedAt: string;
}

export interface JikanRemoteCandidate {
  provider: 'jikan';
  providerId: string;
  title: string;
  mediaType: 'movie' | 'show';
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  runtimeSeconds: number | null;
}

const JIKAN_GENRES_BY_ID: Record<number, string> = {
  1: 'Action',
  2: 'Adventure',
  4: 'Comedy',
  7: 'Mystery',
  8: 'Drama',
  10: 'Fantasy',
  14: 'Horror',
  15: 'Kids',
  17: 'Martial Arts',
  19: 'Music',
  22: 'Romance',
  24: 'Sci-Fi',
  27: 'Shounen',
  30: 'Sports',
  31: 'Super Power',
  36: 'Slice of Life',
  37: 'Supernatural',
  38: 'Military',
  39: 'Police',
  40: 'Psychological',
  41: 'Thriller',
  42: 'Seinen',
  43: 'Josei',
  47: 'Gourmet',
  48: 'Suspense',
  62: 'Isekai',
};

@Injectable()
export class JikanMetadataService {
  private readonly logger = new Logger(JikanMetadataService.name);
  private readonly cache = new Map<string, JikanLookupResult | null>();
  private readonly seriesCatalogInFlight = new Map<
    string,
    Promise<JikanSeriesEpisodeCatalog | null>
  >();
  private readonly cacheProvider = 'jikan.anime';
  private readonly minRequestIntervalMs = 2_200;
  private readonly defaultRateLimitCooldownMs = 60_000;
  private readonly maxRateLimitCooldownMs = 5 * 60_000;
  private readonly genreFilters = [
    'genres',
    'explicit_genres',
    'themes',
    'demographics',
  ] as const;
  private readonly genreCatalogCacheTtlMs = 6 * 60 * 60 * 1000;
  private nextRequestAllowedAt = 0;
  private rateLimitedUntil = 0;
  private lastRateLimitWarningAt = 0;
  private genreCatalogLoadedAt = 0;
  private genreIdsByNormalizedLabel = new Map<string, number>();

  constructor(private readonly metadataApiCacheStore: MetadataApiCacheStore) {}

  clearLookupCache(): number {
    const clearedEntries = this.cache.size;
    this.cache.clear();
    return clearedEntries;
  }

  async lookup(input: JikanLookupInput): Promise<JikanLookupResult | null> {
    const cleanedTitle = input.title.trim();
    if (!cleanedTitle) {
      return null;
    }

    const cacheKey = this.cacheKey(cleanedTitle, input.releaseYear);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    if (Date.now() < this.rateLimitedUntil) {
      return null;
    }

    try {
      const result = await this.searchJikan({
        title: cleanedTitle,
        releaseYear: input.releaseYear,
      });

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, cleanedTitle);
        return null;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Jikan lookup failed for "${cleanedTitle}": ${message}`);
      this.cache.delete(cacheKey);
      return null;
    }
  }

  async searchCandidates(input: {
    title: string;
    limit?: number;
    useCache?: boolean;
  }): Promise<JikanRemoteCandidate[]> {
    const cleanedTitle = input.title.trim();
    if (cleanedTitle.length < 2) {
      return [];
    }

    if (Date.now() < this.rateLimitedUntil) {
      return [];
    }

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
        payload = await this.metadataApiCacheStore.get<JikanSearchResponse>(
          this.cacheProvider,
          requestKey,
        );
      }

      if (payload === undefined) {
        const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
        payload = (await this.fetchJson(url, 15000)) as JikanSearchResponse;

        if (useCache) {
          await this.metadataApiCacheStore.set(
            this.cacheProvider,
            requestKey,
            payload,
          );
        }
      }

      const rawResults = Array.isArray(payload.data) ? payload.data : [];
      const candidates: JikanRemoteCandidate[] = [];

      for (const raw of rawResults) {
        const candidate = this.toRemoteCandidate(raw);
        if (!candidate) {
          continue;
        }

        candidates.push(candidate);
        if (candidates.length >= limit) {
          break;
        }
      }

      return candidates;
    } catch (error) {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, cleanedTitle);
        return [];
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Jikan remote search failed for "${cleanedTitle}": ${message}`,
      );
      return [];
    }
  }

  async searchCandidatesByTag(input: {
    tag: string;
    limit?: number;
    page?: number;
    useCache?: boolean;
  }): Promise<JikanRemoteCandidate[]> {
    const cleanedTag = input.tag.trim();
    if (cleanedTag.length < 2) {
      return [];
    }

    if (Date.now() < this.rateLimitedUntil) {
      return [];
    }

    const limit = Math.max(1, Math.min(input.limit ?? 30, 120));
    const requestedPage =
      typeof input.page === 'number' && Number.isFinite(input.page)
        ? Math.max(1, Math.floor(input.page))
        : null;
    const useCache = input.useCache !== false;
    const genreId = await this.resolveGenreId(cleanedTag, useCache);
    if (!genreId) {
      return [];
    }

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

        let payload: JikanSearchResponse | undefined;

        if (useCache) {
          payload = await this.metadataApiCacheStore.get<JikanSearchResponse>(
            this.cacheProvider,
            requestKey,
          );
        }

        if (payload === undefined) {
          const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
          payload = (await this.fetchJson(url, 15000)) as JikanSearchResponse;

          if (useCache) {
            await this.metadataApiCacheStore.set(
              this.cacheProvider,
              requestKey,
              payload,
            );
          }
        }

        const rawResults = Array.isArray(payload.data) ? payload.data : [];
        if (rawResults.length === 0) {
          break;
        }

        for (const raw of rawResults) {
          const candidate = this.toRemoteCandidate(raw);
          if (!candidate) {
            continue;
          }

          const key = `${candidate.mediaType}:${candidate.providerId}`;
          if (!deduped.has(key)) {
            deduped.set(key, candidate);
          }

          if (deduped.size >= limit) {
            return [...deduped.values()].slice(0, limit);
          }
        }
      }

      return [...deduped.values()].slice(0, limit);
    } catch (error) {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, cleanedTag);
        return [];
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Jikan remote tag search failed for "${cleanedTag}": ${message}`,
      );
      return [];
    }
  }

  async getRemoteDetails(
    providerId: string,
  ): Promise<JikanRemoteCandidate | null> {
    const resolvedId = this.extractProviderId({ mal_id: providerId });
    if (!resolvedId) {
      return null;
    }

    if (Date.now() < this.rateLimitedUntil) {
      return null;
    }

    const requestKey = `remote:details:${resolvedId}`;

    try {
      const cachedPayload =
        await this.metadataApiCacheStore.get<JikanDetailsResponse>(
          this.cacheProvider,
          requestKey,
        );

      let payload: JikanDetailsResponse;
      if (cachedPayload !== undefined) {
        payload = cachedPayload;
      } else {
        const url = `https://api.jikan.moe/v4/anime/${resolvedId}/full`;
        payload = (await this.fetchJson(url, 15000)) as JikanDetailsResponse;
        await this.metadataApiCacheStore.set(
          this.cacheProvider,
          requestKey,
          payload,
        );
      }

      return this.toRemoteCandidate(payload.data);
    } catch (error) {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, `id:${resolvedId}`);
        return null;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Jikan remote details lookup failed for ${resolvedId}: ${message}`,
      );
      return null;
    }
  }

  async getSeriesEpisodeCatalog(
    providerId: string,
    options?: { useCache?: boolean },
  ): Promise<JikanSeriesEpisodeCatalog | null> {
    const resolvedId = this.extractProviderId({ mal_id: providerId });
    if (!resolvedId) {
      return null;
    }

    const useCache = options?.useCache !== false;
    const requestKey = `series-episodes:${resolvedId}:v1`;

    if (useCache) {
      const cachedCatalog =
        await this.metadataApiCacheStore.get<JikanSeriesEpisodeCatalog>(
          this.cacheProvider,
          requestKey,
        );
      if (cachedCatalog) {
        const normalized = this.normalizeSeriesEpisodeCatalog(cachedCatalog);
        if (normalized) {
          return normalized;
        }
      }
    }

    const inFlight = this.seriesCatalogInFlight.get(resolvedId);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = this.loadSeriesEpisodeCatalog(resolvedId, useCache)
      .catch((error) => {
        if (error instanceof JikanRateLimitError) {
          this.applyRateLimitCooldown(error.retryAfterMs, `id:${resolvedId}`);
          return null;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Jikan series episode catalog lookup failed for ${resolvedId}: ${message}`,
        );
        return null;
      })
      .finally(() => {
        this.seriesCatalogInFlight.delete(resolvedId);
      });

    this.seriesCatalogInFlight.set(resolvedId, loadPromise);
    return loadPromise;
  }

  warmSeriesEpisodeCatalog(providerId: string): void {
    void this.getSeriesEpisodeCatalog(providerId).catch((error) => {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, `id:${providerId}`);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Jikan series episode warmup failed for ${providerId}: ${message}`,
      );
    });
  }

  private async loadSeriesEpisodeCatalog(
    resolvedId: string,
    useCache: boolean,
  ): Promise<JikanSeriesEpisodeCatalog | null> {
    if (Date.now() < this.rateLimitedUntil) {
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
        payload = await this.metadataApiCacheStore.get<JikanEpisodesResponse>(
          this.cacheProvider,
          requestKey,
        );
      }

      if (payload === undefined) {
        const url = `https://api.jikan.moe/v4/anime/${resolvedId}/episodes?${params.toString()}`;
        payload = (await this.fetchJson(url, 15000)) as JikanEpisodesResponse;

        if (useCache) {
          await this.metadataApiCacheStore.set(
            this.cacheProvider,
            requestKey,
            payload,
          );
        }
      }

      const pageEpisodes = this.extractSeriesEpisodes(payload.data);
      if (pageEpisodes.length > 0) {
        episodes.push(...pageEpisodes);
      }

      if (!this.hasNextEpisodePage(payload.pagination, page)) {
        break;
      }

      page += 1;
    }

    const normalizedEpisodes = this.dedupeSeriesEpisodes(episodes);

    if (normalizedEpisodes.length === 0) {
      return null;
    }

    const catalog: JikanSeriesEpisodeCatalog = {
      providerId: resolvedId,
      totalEpisodeCount: normalizedEpisodes.length,
      episodes: normalizedEpisodes,
      updatedAt: new Date().toISOString(),
    };

    await this.metadataApiCacheStore.set(
      this.cacheProvider,
      `series-episodes:${resolvedId}:v1`,
      catalog,
    );

    return catalog;
  }

  private async searchJikan(
    input: JikanLookupInput,
  ): Promise<JikanLookupResult | null> {
    const params = new URLSearchParams({
      q: input.title,
      limit: '10',
      sfw: 'true',
    });

    const requestKey = params.toString();
    const cachedPayload =
      await this.metadataApiCacheStore.get<JikanSearchResponse>(
        this.cacheProvider,
        requestKey,
      );

    let payload: JikanSearchResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
      payload = (await this.fetchJson(url, 15000)) as JikanSearchResponse;
      await this.metadataApiCacheStore.set(
        this.cacheProvider,
        requestKey,
        payload,
      );
    }

    const rawResults = Array.isArray(payload.data) ? payload.data : [];
    const candidates = rawResults
      .map((item) => this.toCandidate(item))
      .filter((candidate): candidate is JikanCandidate => candidate !== null);

    const exactCandidates = this.filterExactTitleCandidates(candidates, input);
    if (exactCandidates.length === 0) {
      return null;
    }

    const picked = this.pickBestCandidate(exactCandidates, input.releaseYear);
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

  private toCandidate(item: unknown): JikanCandidate | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }

    const value = item as Record<string, unknown>;
    const providerId = this.extractProviderId(value);
    if (!providerId) {
      return null;
    }

    const titlesForMatch = this.collectTitles(value);
    if (titlesForMatch.length === 0) {
      return null;
    }

    const preferredTitle =
      this.getTitleString(value.title_english) ??
      this.getTitleString(value.title) ??
      titlesForMatch[0];

    return {
      providerId,
      mediaType: this.resolveMediaType(value),
      title: preferredTitle,
      titlesForMatch,
      tags: this.extractTags(value),
      overview: this.getNullableString(value.synopsis),
      releaseYear: this.extractYear(value),
      posterUrl: this.extractPosterUrl(value),
      backdropUrl: this.extractBackdropUrl(value),
      score:
        typeof value.score === 'number' && Number.isFinite(value.score)
          ? value.score
          : null,
    };
  }

  private collectTitles(value: Record<string, unknown>): string[] {
    const titles = new Set<string>();

    this.addTitle(titles, value.title);
    this.addTitle(titles, value.title_english);
    this.addTitle(titles, value.title_japanese);

    if (Array.isArray(value.titles)) {
      for (const entry of value.titles) {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          Array.isArray(entry)
        ) {
          continue;
        }

        const title = (entry as Record<string, unknown>).title;
        this.addTitle(titles, title);
      }
    }

    return [...titles];
  }

  private addTitle(titles: Set<string>, value: unknown): void {
    if (typeof value !== 'string') {
      return;
    }

    const cleaned = value.trim();
    if (cleaned) {
      titles.add(cleaned);
    }
  }

  private extractTags(value: Record<string, unknown>): string[] {
    const tags: string[] = [];
    this.collectNamedTags(value.genres, tags);
    this.collectNamedTags(value.explicit_genres, tags);
    this.collectNamedTags(value.themes, tags);
    this.collectNamedTags(value.demographics, tags);
    return this.normalizeTags(tags);
  }

  private collectNamedTags(source: unknown, bucket: string[]): void {
    if (!Array.isArray(source)) {
      return;
    }

    for (const entry of source) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }

      const name = this.getTitleString((entry as Record<string, unknown>).name);
      if (name) {
        bucket.push(name);
      }
    }
  }

  private normalizeTags(tags: string[]): string[] {
    const deduped = new Map<string, string>();

    for (const tag of tags) {
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

  private filterExactTitleCandidates(
    candidates: JikanCandidate[],
    input: JikanLookupInput,
  ): JikanCandidate[] {
    const normalizedInput = this.normalizeForExactMatch(input.title);
    if (!normalizedInput) {
      return [];
    }

    return candidates.filter((candidate) => {
      const exactTitleMatch = candidate.titlesForMatch.some(
        (title) => this.normalizeForExactMatch(title) === normalizedInput,
      );
      if (!exactTitleMatch) {
        return false;
      }

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

  private normalizeForExactMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private pickBestCandidate(
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

  private getTitleString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned || null;
  }

  private getNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned || null;
  }

  private extractYear(value: Record<string, unknown>): number | null {
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
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private extractPosterUrl(value: Record<string, unknown>): string | null {
    const images =
      typeof value.images === 'object' &&
      value.images !== null &&
      !Array.isArray(value.images)
        ? (value.images as Record<string, unknown>)
        : null;

    if (!images) {
      return null;
    }

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
      this.getTitleString(jpg?.large_image_url) ??
      this.getTitleString(jpg?.image_url) ??
      this.getTitleString(webp?.large_image_url) ??
      this.getTitleString(webp?.image_url) ??
      null
    );
  }

  private extractBackdropUrl(value: Record<string, unknown>): string | null {
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
      this.getTitleString(images?.maximum_image_url) ??
      this.getTitleString(images?.large_image_url) ??
      this.getTitleString(images?.medium_image_url) ??
      this.getTitleString(images?.small_image_url) ??
      this.getTitleString(images?.image_url) ??
      null
    );
  }

  private toRemoteCandidate(item: unknown): JikanRemoteCandidate | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }

    const value = item as Record<string, unknown>;
    const providerId = this.extractProviderId(value);
    if (!providerId) {
      return null;
    }

    const base = this.toCandidate(value);
    if (!base) {
      return null;
    }

    return {
      provider: 'jikan',
      providerId,
      title: base.title,
      mediaType: this.resolveMediaType(value),
      tags: base.tags,
      overview: base.overview,
      releaseYear: base.releaseYear,
      posterUrl: base.posterUrl,
      backdropUrl: base.backdropUrl,
      runtimeSeconds: this.extractDurationSeconds(value),
    };
  }

  private resolveMediaType(value: Record<string, unknown>): 'movie' | 'show' {
    const type =
      typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
    return type === 'movie' ? 'movie' : 'show';
  }

  private extractProviderId(value: Record<string, unknown>): string | null {
    const raw = value.mal_id;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const numeric = Math.trunc(raw);
      return numeric > 0 ? String(numeric) : null;
    }

    if (typeof raw !== 'string') {
      return null;
    }

    const cleaned = raw.trim();
    return /^\d+$/.test(cleaned) ? cleaned : null;
  }

  private extractDurationSeconds(
    value: Record<string, unknown>,
  ): number | null {
    const duration =
      typeof value.duration === 'string'
        ? value.duration.trim().toLowerCase()
        : '';
    if (!duration) {
      return null;
    }

    const hourMatch = duration.match(/(\d+)\s*(?:hour|hr|h)/);
    const minuteMatch = duration.match(/(\d+)\s*(?:minute|min|m)/);

    const hours = hourMatch ? Number.parseInt(hourMatch[1], 10) : 0;
    const minutes = minuteMatch ? Number.parseInt(minuteMatch[1], 10) : 0;

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    const totalMinutes = Math.max(0, hours) * 60 + Math.max(0, minutes);
    return totalMinutes > 0 ? totalMinutes * 60 : null;
  }

  private normalizeSeriesEpisodeCatalog(
    value: unknown,
  ): JikanSeriesEpisodeCatalog | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    const source = value as Record<string, unknown>;
    const providerId = this.extractProviderId({ mal_id: source.providerId });
    if (!providerId) {
      return null;
    }

    const episodes = this.extractSeriesEpisodes(source.episodes);
    if (episodes.length === 0) {
      return null;
    }

    const normalizedEpisodes = this.dedupeSeriesEpisodes(episodes);

    const totalEpisodeCount = this.extractPositiveInt(source.totalEpisodeCount);
    const updatedAt = this.getNullableString(source.updatedAt);

    return {
      providerId,
      totalEpisodeCount: totalEpisodeCount ?? normalizedEpisodes.length,
      episodes: normalizedEpisodes,
      updatedAt: updatedAt ?? new Date().toISOString(),
    };
  }

  private extractSeriesEpisodes(value: unknown): JikanSeriesEpisode[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const episodes: JikanSeriesEpisode[] = [];

    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }

      const row = entry as Record<string, unknown>;
      const episodeNumber = this.extractPositiveInt(row.mal_id);
      if (!episodeNumber) {
        continue;
      }

      const title =
        this.getTitleString(row.title) ??
        this.getTitleString(row.title_romanji) ??
        this.getTitleString(row.title_japanese) ??
        `Episode ${episodeNumber}`;

      const airedAt =
        this.getNullableString(row.aired) ??
        this.getNullableString(row.premiered) ??
        null;

      const synopsis =
        this.getNullableString(row.synopsis) ??
        this.getNullableString(row.description) ??
        null;

      episodes.push({
        episodeNumber,
        title,
        airedAt,
        synopsis,
      });
    }

    return episodes;
  }

  private dedupeSeriesEpisodes(
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

  private hasNextEpisodePage(
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
    if (value.has_next_page === true) {
      return true;
    }

    const lastVisiblePage = this.extractPositiveInt(value.last_visible_page);
    if (lastVisiblePage && currentPage < lastVisiblePage) {
      return true;
    }

    return false;
  }

  private extractPositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const rounded = Math.trunc(value);
      return rounded > 0 ? rounded : null;
    }

    if (typeof value === 'string') {
      const cleaned = value.trim();
      if (/^\d+$/.test(cleaned)) {
        const parsed = Number.parseInt(cleaned, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
    }

    return null;
  }

  private cacheKey(title: string, releaseYear: number | null): string {
    return `${title.toLowerCase()}:${releaseYear ?? 0}`;
  }

  private async resolveGenreId(
    tag: string,
    useCache: boolean,
  ): Promise<number | null> {
    const normalizedTag = this.normalizeGenreLabel(tag);
    if (!normalizedTag) {
      return null;
    }

    const hasFreshCatalog =
      this.genreIdsByNormalizedLabel.size > 0 &&
      Date.now() - this.genreCatalogLoadedAt < this.genreCatalogCacheTtlMs;

    if (!hasFreshCatalog) {
      try {
        await this.refreshGenreCatalog(useCache);
      } catch (error) {
        if (error instanceof JikanRateLimitError) {
          this.applyRateLimitCooldown(error.retryAfterMs, `genre:${tag}`);
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Jikan genre catalog refresh failed: ${message}`);
        }
      }
    }

    const candidates = new Set<string>([normalizedTag]);
    this.addTagAliases(normalizedTag, candidates);

    for (const candidate of candidates) {
      const matched = this.matchGenreId(candidate);
      if (matched) {
        return matched;
      }
    }

    return null;
  }

  private matchGenreId(normalizedTag: string): number | null {
    const exact = this.genreIdsByNormalizedLabel.get(normalizedTag);
    if (exact) {
      return exact;
    }

    for (const [label, id] of this.genreIdsByNormalizedLabel) {
      if (label.includes(normalizedTag) || normalizedTag.includes(label)) {
        return id;
      }
    }

    for (const [id, label] of Object.entries(JIKAN_GENRES_BY_ID)) {
      const normalizedLabel = this.normalizeGenreLabel(label);
      if (
        normalizedLabel === normalizedTag ||
        normalizedLabel.includes(normalizedTag) ||
        normalizedTag.includes(normalizedLabel)
      ) {
        return Number.parseInt(id, 10);
      }
    }

    return null;
  }

  private async refreshGenreCatalog(useCache: boolean): Promise<void> {
    const discovered = new Map<string, number>();

    for (const filter of this.genreFilters) {
      const params = new URLSearchParams({ filter });
      const requestKey = `genre-catalog:${params.toString()}`;
      let payload: JikanGenreCatalogResponse | undefined;

      if (useCache) {
        payload =
          await this.metadataApiCacheStore.get<JikanGenreCatalogResponse>(
            this.cacheProvider,
            requestKey,
          );
      }

      if (payload === undefined) {
        const url = `https://api.jikan.moe/v4/genres/anime?${params.toString()}`;
        payload = (await this.fetchJson(
          url,
          15000,
        )) as JikanGenreCatalogResponse;

        if (useCache) {
          await this.metadataApiCacheStore.set(
            this.cacheProvider,
            requestKey,
            payload,
          );
        }
      }

      this.ingestGenreCatalogEntries(discovered, payload.data);
    }

    if (discovered.size > 0) {
      this.genreIdsByNormalizedLabel = discovered;
      this.genreCatalogLoadedAt = Date.now();
    }
  }

  private ingestGenreCatalogEntries(
    bucket: Map<string, number>,
    entries: unknown[] | undefined,
  ): void {
    if (!Array.isArray(entries)) {
      return;
    }

    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }

      const value = entry as Record<string, unknown>;
      const id = this.extractGenreId(value.mal_id);
      const name = this.getTitleString(value.name);
      if (!id || !name) {
        continue;
      }

      const normalizedName = this.normalizeGenreLabel(name);
      if (!normalizedName || bucket.has(normalizedName)) {
        continue;
      }

      bucket.set(normalizedName, id);
    }
  }

  private extractGenreId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const id = Math.trunc(value);
      return id > 0 ? id : null;
    }

    if (typeof value === 'string') {
      const cleaned = value.trim();
      if (/^\d+$/.test(cleaned)) {
        const id = Number.parseInt(cleaned, 10);
        return Number.isFinite(id) && id > 0 ? id : null;
      }
    }

    return null;
  }

  private addTagAliases(value: string, bucket: Set<string>): void {
    if (value === 'sci fi' || value === 'scifi') {
      bucket.add('sci fi');
      bucket.add('science fiction');
    }

    if (value === 'science fiction') {
      bucket.add('sci fi');
    }
  }

  private normalizeGenreLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    await this.waitForRequestWindow();

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (response.status === 429) {
        const raw = await response.text();
        const retryAfterMs = this.normalizeCooldownMs(
          this.parseRetryAfterMs(response.headers.get('retry-after')),
        );
        throw new JikanRateLimitError(
          `HTTP 429 from Jikan: ${raw.slice(0, 240)}`,
          retryAfterMs,
        );
      }

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(
          `HTTP ${response.status} from Jikan: ${raw.slice(0, 240)}`,
        );
      }

      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async waitForRequestWindow(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAllowedAt - now);

    if (waitMs > 0) {
      await this.delay(waitMs);
    }

    this.nextRequestAllowedAt = Date.now() + this.minRequestIntervalMs;
  }

  private applyRateLimitCooldown(
    requestedCooldownMs: number,
    attemptedTitle: string,
  ): void {
    const cooldownMs = this.normalizeCooldownMs(requestedCooldownMs);
    const now = Date.now();
    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, now + cooldownMs);

    const warningGapMs = 15_000;
    if (now - this.lastRateLimitWarningAt < warningGapMs) {
      return;
    }

    this.lastRateLimitWarningAt = now;
    const waitSeconds = Math.max(
      1,
      Math.ceil((this.rateLimitedUntil - now) / 1000),
    );
    this.logger.warn(
      `Jikan rate limit reached while searching "${attemptedTitle}". Pausing Jikan lookups for ~${waitSeconds}s.`,
    );
  }

  private parseRetryAfterMs(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryAt = Date.parse(trimmed);
    if (!Number.isFinite(retryAt)) {
      return null;
    }

    const delta = retryAt - Date.now();
    return delta > 0 ? delta : null;
  }

  private normalizeCooldownMs(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return this.defaultRateLimitCooldownMs;
    }

    const rounded = Math.round(value);
    return Math.max(
      this.minRequestIntervalMs,
      Math.min(this.maxRateLimitCooldownMs, rounded),
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
