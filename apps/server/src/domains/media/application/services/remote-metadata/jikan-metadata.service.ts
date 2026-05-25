import { Injectable, Logger } from '@nestjs/common';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import {
  extractPositiveInteger as sharedExtractPositiveInteger,
  normalizeLabel as sharedNormalizeLabel,
} from './remote-metadata-normalization';
import {
  getRemoteDetailsValue,
  lookupValue,
  searchCandidatesByTagValue,
  searchCandidatesValue,
  type JikanSearchContext,
} from './jikan-search.helper';
import { getSeriesEpisodeCatalogValue } from './jikan-series-catalog.helper';
import { extractProviderId } from './jikan-candidate-utils.helper';
import { JikanRateLimitError } from './jikan-rate-limit.helper';
export type {
  JikanLookupResult,
  JikanSeriesEpisode,
  JikanSeriesEpisodeCatalog,
  JikanRemoteCandidate,
} from './jikan-metadata.types';
import {
  JIKAN_GENRES_BY_ID,
  type JikanGenreCatalogResponse,
  type JikanLookupInput,
  type JikanLookupResult,
  type JikanRemoteCandidate,
  type JikanSeriesEpisodeCatalog,
} from './jikan-metadata.types';

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
    return lookupValue(this.searchContext(), input);
  }

  async searchCandidates(input: {
    title: string;
    limit?: number;
    useCache?: boolean;
  }): Promise<JikanRemoteCandidate[]> {
    return searchCandidatesValue(this.searchContext(), input);
  }

  async searchCandidatesByTag(input: {
    tag: string;
    limit?: number;
    page?: number;
    useCache?: boolean;
  }): Promise<JikanRemoteCandidate[]> {
    return searchCandidatesByTagValue(this.searchContext(), input);
  }

  async getRemoteDetails(
    providerId: string,
  ): Promise<JikanRemoteCandidate | null> {
    return getRemoteDetailsValue(this.searchContext(), providerId);
  }

  async getSeriesEpisodeCatalog(
    providerId: string,
    options?: { useCache?: boolean },
  ): Promise<JikanSeriesEpisodeCatalog | null> {
    const resolvedId = extractProviderId({ mal_id: providerId });
    if (!resolvedId) {
      return null;
    }
    return getSeriesEpisodeCatalogValue(
      this.seriesContext(),
      resolvedId,
      options,
    );
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

  private searchContext(): JikanSearchContext {
    return {
      cacheProvider: this.cacheProvider,
      cache: this.cache,
      metadataApiCacheStore: this.metadataApiCacheStore,
      isRateLimited: () => this.isRateLimited(),
      fetchJson: (url, timeoutMs) => this.fetchJson(url, timeoutMs),
      applyRateLimitCooldown: (ms, title) =>
        this.applyRateLimitCooldown(ms, title),
      logger: this.logger,
      resolveGenreId: (tag, useCache) => this.resolveGenreId(tag, useCache),
    };
  }

  private seriesContext() {
    return {
      cacheProvider: this.cacheProvider,
      metadataApiCacheStore: this.metadataApiCacheStore,
      seriesCatalogInFlight: this.seriesCatalogInFlight,
      isRateLimited: () => this.isRateLimited(),
      fetchJson: (url: string, timeoutMs: number) =>
        this.fetchJson(url, timeoutMs),
      applyRateLimitCooldown: (ms: number, title: string) =>
        this.applyRateLimitCooldown(ms, title),
      logger: this.logger,
    };
  }

  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  private async resolveGenreId(
    tag: string,
    useCache: boolean,
  ): Promise<number | null> {
    const normalizedTag = sharedNormalizeLabel(tag);
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
      const normalizedLabel = sharedNormalizeLabel(label);
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
      const id = sharedExtractPositiveInteger(value.mal_id);
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      if (!id || !name) {
        continue;
      }

      const normalizedName = sharedNormalizeLabel(name);
      if (!normalizedName || bucket.has(normalizedName)) {
        continue;
      }

      bucket.set(normalizedName, id);
    }
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

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    await this.waitForRequestWindow();

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: abortController.signal });

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
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      });
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
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;

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
    const rounded =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value)
        : this.defaultRateLimitCooldownMs;

    return Math.max(
      this.minRequestIntervalMs,
      Math.min(this.maxRateLimitCooldownMs, rounded),
    );
  }
}
