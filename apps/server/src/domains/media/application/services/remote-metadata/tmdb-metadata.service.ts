import { Injectable, Logger } from '@nestjs/common';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import {
  getRemoteDetailsValue,
  lookupValue,
  searchCandidatesValue,
  searchRemoteCandidatesByTagValue,
  searchRemoteCandidatesValue,
  type TmdbSearchContext,
} from './tmdb-remote-search.helper';
import { getSeriesEpisodeCatalogValue } from './tmdb-series-catalog.helper';
export type {
  TmdbLookupResult,
  TmdbSeriesEpisode,
  TmdbSeriesEpisodeCatalog,
  TmdbSearchCandidate,
  TmdbRemoteCandidate,
} from './tmdb-metadata.types';
import type {
  TmdbLookupInput,
  TmdbLookupResult,
  TmdbRemoteCandidate,
  TmdbSearchCandidate,
  TmdbSeriesEpisodeCatalog,
} from './tmdb-metadata.types';

@Injectable()
export class TmdbMetadataService {
  private readonly logger = new Logger(TmdbMetadataService.name);
  private readonly cache = new Map<string, TmdbLookupResult | null>();
  private readonly seriesCatalogInFlight = new Map<
    string,
    Promise<TmdbSeriesEpisodeCatalog | null>
  >();
  private readonly cacheProvider = 'tmdb.search';
  private readonly posterImageBaseUrl = 'https://image.tmdb.org/t/p/w500';
  private readonly backdropImageBaseUrl = 'https://image.tmdb.org/t/p/w780';

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly metadataApiCacheStore: MetadataApiCacheStore,
  ) {}

  clearLookupCache(): number {
    const clearedEntries = this.cache.size;
    this.cache.clear();
    return clearedEntries;
  }

  async lookup(input: TmdbLookupInput): Promise<TmdbLookupResult | null> {
    return lookupValue(this.searchContext(), input);
  }

  async searchCandidates(input: {
    title: string;
    mediaType: 'movie' | 'show' | 'other';
    releaseYear: number | null;
    limit?: number;
  }): Promise<TmdbSearchCandidate[]> {
    return searchCandidatesValue(this.searchContext(), input);
  }

  async searchRemoteCandidates(input: {
    title: string;
    limit?: number;
    useCache?: boolean;
  }): Promise<TmdbRemoteCandidate[]> {
    return searchRemoteCandidatesValue(this.searchContext(), input);
  }

  async searchRemoteCandidatesByTag(input: {
    tag: string;
    limit?: number;
    page?: number;
    useCache?: boolean;
  }): Promise<TmdbRemoteCandidate[]> {
    return searchRemoteCandidatesByTagValue(this.searchContext(), input);
  }

  async getRemoteDetails(input: {
    providerId: string;
    mediaType: 'movie' | 'show';
  }): Promise<TmdbRemoteCandidate | null> {
    return getRemoteDetailsValue(this.searchContext(), input);
  }

  async getSeriesEpisodeCatalog(
    providerId: string,
    options?: { useCache?: boolean },
  ): Promise<TmdbSeriesEpisodeCatalog | null> {
    return getSeriesEpisodeCatalogValue(this.seriesContext(), providerId, options);
  }

  warmSeriesEpisodeCatalog(providerId: string): void {
    void this.getSeriesEpisodeCatalog(providerId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `TMDB series episode warmup failed for ${providerId}: ${message}`,
      );
    });
  }

  private searchContext(): TmdbSearchContext {
    return {
      cacheProvider: this.cacheProvider,
      logger: this.logger,
      posterImageBaseUrl: this.posterImageBaseUrl,
      backdropImageBaseUrl: this.backdropImageBaseUrl,
      getApiKey: () => this.getApiKey(),
      metadataApiCacheStore: this.metadataApiCacheStore,
      fetchJson: (url, timeoutMs) => this.fetchJson(url, timeoutMs),
      cache: this.cache,
    };
  }

  private seriesContext() {
    return {
      cacheProvider: this.cacheProvider,
      metadataApiCacheStore: this.metadataApiCacheStore,
      seriesCatalogInFlight: this.seriesCatalogInFlight,
      getApiKey: () => this.getApiKey(),
      fetchJson: (url: string, timeoutMs: number) => this.fetchJson(url, timeoutMs),
    };
  }

  private async getApiKey(): Promise<string | null> {
    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    return apiKey || null;
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(`HTTP ${response.status} from TMDB: ${raw.slice(0, 240)}`);
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
