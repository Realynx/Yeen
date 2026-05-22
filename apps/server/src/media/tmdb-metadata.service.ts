import { Injectable, Logger } from '@nestjs/common';
import { MetadataApiCacheStore } from './metadata-api-cache.store';
import { SystemSettingsService } from '../system-settings/system-settings.service';

interface TmdbSearchResponse {
  results?: unknown[];
}

interface TmdbDetailsResponse {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  original_title?: unknown;
  original_name?: unknown;
  media_type?: unknown;
  genre_ids?: unknown;
  genres?: unknown;
  overview?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  release_date?: unknown;
  first_air_date?: unknown;
  runtime?: unknown;
  episode_run_time?: unknown;
}

interface TmdbCandidate {
  title: string;
  titlesForMatch: string[];
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

interface TmdbLookupInput {
  title: string;
  mediaType: 'movie' | 'show' | 'other';
  releaseYear: number | null;
}

export interface TmdbLookupResult {
  title: string;
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

export interface TmdbSearchCandidate {
  title: string;
  mediaType: 'movie' | 'show' | 'other';
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  remoteSource: 'tmdb';
  remoteSourceId: string;
}

export interface TmdbRemoteCandidate {
  provider: 'tmdb';
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

interface TmdbDiscoverInput {
  apiKey: string;
  endpoint: 'movie' | 'tv';
  mediaType: 'movie' | 'show';
  genreId: number;
  limit: number;
  page?: number;
  useCache: boolean;
}

const TMDB_MOVIE_GENRES_BY_ID: Record<number, string> = {
  12: 'Adventure',
  14: 'Fantasy',
  16: 'Animation',
  18: 'Drama',
  27: 'Horror',
  28: 'Action',
  35: 'Comedy',
  36: 'History',
  37: 'Western',
  53: 'Thriller',
  80: 'Crime',
  99: 'Documentary',
  878: 'Science Fiction',
  9648: 'Mystery',
  10402: 'Music',
  10749: 'Romance',
  10751: 'Family',
  10752: 'War',
  10770: 'TV Movie',
};

const TMDB_SHOW_GENRES_BY_ID: Record<number, string> = {
  16: 'Animation',
  18: 'Drama',
  35: 'Comedy',
  37: 'Western',
  80: 'Crime',
  99: 'Documentary',
  9648: 'Mystery',
  10751: 'Family',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

@Injectable()
export class TmdbMetadataService {
  private readonly logger = new Logger(TmdbMetadataService.name);
  private readonly cache = new Map<string, TmdbLookupResult | null>();
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
    const cleanedTitle = input.title.trim();
    if (!cleanedTitle) {
      return null;
    }

    const cacheKey = this.cacheKey(
      input.mediaType,
      cleanedTitle,
      input.releaseYear,
    );
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    if (!apiKey) {
      this.cache.set(cacheKey, null);
      return null;
    }

    try {
      const result = await this.searchTmdb(apiKey, {
        title: cleanedTitle,
        mediaType: input.mediaType,
        releaseYear: input.releaseYear,
      });

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TMDB lookup failed for "${cleanedTitle}": ${message}`);
      this.cache.delete(cacheKey);
      return null;
    }
  }

  /**
   * Free-form search returning up to `limit` ranked candidates.
   * Unlike `lookup`, this does NOT enforce exact title matching, so it
   * is suitable for interactive admin pickers where the user is still
   * typing the title.
   */
  async searchCandidates(input: {
    title: string;
    mediaType: 'movie' | 'show' | 'other';
    releaseYear: number | null;
    limit?: number;
  }): Promise<TmdbSearchCandidate[]> {
    const cleanedTitle = input.title.trim();
    if (cleanedTitle.length < 2) {
      return [];
    }

    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    if (!apiKey) {
      return [];
    }

    const endpoint = this.endpointForType(input.mediaType);
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
        await this.metadataApiCacheStore.get<TmdbSearchResponse>(
          this.cacheProvider,
          requestKey,
        );

      let payload: TmdbSearchResponse;
      if (cachedPayload !== undefined) {
        payload = cachedPayload;
      } else {
        const requestParams = new URLSearchParams(params);
        requestParams.set('api_key', apiKey);
        const url = `https://api.themoviedb.org/3/search/${endpoint}?${requestParams.toString()}`;

        payload = (await this.fetchJson(url, 15000)) as TmdbSearchResponse;
        await this.metadataApiCacheStore.set(
          this.cacheProvider,
          requestKey,
          payload,
        );
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      const limit = Math.max(1, Math.min(input.limit ?? 8, 20));

      const candidates: TmdbSearchCandidate[] = [];
      for (const raw of results) {
        const candidate = this.toCandidate(raw, input.mediaType);
        if (!candidate) {
          continue;
        }

        const rawRecord = raw as Record<string, unknown>;
        const sourceId = this.resolveTmdbSourceId(rawRecord.id);
        if (!sourceId) {
          continue;
        }

        candidates.push({
          title: candidate.title,
          mediaType: this.resolveCandidateMediaType(
            rawRecord,
            input.mediaType,
          ),
          tags: candidate.tags,
          overview: candidate.overview,
          releaseYear: candidate.releaseYear,
          posterUrl: candidate.posterUrl,
          backdropUrl: candidate.backdropUrl,
          remoteSource: 'tmdb',
          remoteSourceId: sourceId,
        });

        if (candidates.length >= limit) {
          break;
        }
      }

      return candidates;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `TMDB search failed for "${cleanedTitle}": ${message}`,
      );
      return [];
    }
  }

  async searchRemoteCandidates(input: {
    title: string;
    limit?: number;
    useCache?: boolean;
  }): Promise<TmdbRemoteCandidate[]> {
    const cleanedTitle = input.title.trim();
    if (cleanedTitle.length < 2) {
      return [];
    }

    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    if (!apiKey) {
      return [];
    }

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
        payload = await this.metadataApiCacheStore.get<TmdbSearchResponse>(
          this.cacheProvider,
          requestKey,
        );
      }

      if (payload === undefined) {
        const requestParams = new URLSearchParams(params);
        requestParams.set('api_key', apiKey);
        const url = `https://api.themoviedb.org/3/search/multi?${requestParams.toString()}`;

        payload = (await this.fetchJson(url, 15000)) as TmdbSearchResponse;

        if (useCache) {
          await this.metadataApiCacheStore.set(
            this.cacheProvider,
            requestKey,
            payload,
          );
        }
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      const limit = Math.max(1, Math.min(input.limit ?? 16, 40));
      const candidates: TmdbRemoteCandidate[] = [];

      for (const raw of results) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          continue;
        }

        const value = raw as Record<string, unknown>;
        const candidateType = this.resolveCandidateMediaType(value, 'other');
        if (candidateType !== 'movie' && candidateType !== 'show') {
          continue;
        }

        const providerId = this.extractNumericId(value.id);
        if (!providerId) {
          continue;
        }

        const candidate = this.toCandidate(value, 'other');
        if (!candidate) {
          continue;
        }

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

        if (candidates.length >= limit) {
          break;
        }
      }

      return candidates;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `TMDB remote search failed for "${cleanedTitle}": ${message}`,
      );
      return [];
    }
  }

  async searchRemoteCandidatesByTag(input: {
    tag: string;
    limit?: number;
    page?: number;
    useCache?: boolean;
  }): Promise<TmdbRemoteCandidate[]> {
    const cleanedTag = input.tag.trim();
    if (cleanedTag.length < 2) {
      return [];
    }

    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    if (!apiKey) {
      return [];
    }

    const normalizedTag = this.normalizeGenreLabel(cleanedTag);
    if (!normalizedTag) {
      return [];
    }

    const movieGenreId = this.resolveGenreId(normalizedTag, TMDB_MOVIE_GENRES_BY_ID);
    const showGenreId = this.resolveGenreId(normalizedTag, TMDB_SHOW_GENRES_BY_ID);

    if (!movieGenreId && !showGenreId) {
      return [];
    }

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
      targets.map((target) => this.discoverRemoteCandidates(target)),
    );

    const deduped = new Map<string, TmdbRemoteCandidate>();
    for (const candidate of discoveredByTarget.flat()) {
      const key = `${candidate.mediaType}:${candidate.providerId}`;
      if (!deduped.has(key)) {
        deduped.set(key, candidate);
      }
    }

    return [...deduped.values()].slice(0, limit);
  }

  async getRemoteDetails(input: {
    providerId: string;
    mediaType: 'movie' | 'show';
  }): Promise<TmdbRemoteCandidate | null> {
    const providerId = this.extractNumericId(input.providerId);
    if (!providerId) {
      return null;
    }

    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings.tmdbApiKey.trim();
    if (!apiKey) {
      return null;
    }

    const endpoint = input.mediaType === 'show' ? 'tv' : 'movie';
    const requestKey = `remote:details:${endpoint}:${providerId}`;

    try {
      const cachedPayload =
        await this.metadataApiCacheStore.get<TmdbDetailsResponse>(
          this.cacheProvider,
          requestKey,
        );

      let payload: TmdbDetailsResponse;
      if (cachedPayload !== undefined) {
        payload = cachedPayload;
      } else {
        const params = new URLSearchParams({
          api_key: apiKey,
        });
        const url = `https://api.themoviedb.org/3/${endpoint}/${providerId}?${params.toString()}`;

        payload = (await this.fetchJson(url, 15000)) as TmdbDetailsResponse;
        await this.metadataApiCacheStore.set(
          this.cacheProvider,
          requestKey,
          payload,
        );
      }

      const candidate = this.toCandidate(payload, input.mediaType);
      if (!candidate) {
        return null;
      }

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
        runtimeSeconds: this.extractRuntimeSeconds(payload, input.mediaType),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `TMDB remote details lookup failed for ${providerId}: ${message}`,
      );
      return null;
    }
  }

  private async searchTmdb(
    apiKey: string,
    input: TmdbLookupInput,
  ): Promise<TmdbLookupResult | null> {
    const endpoint = this.endpointForType(input.mediaType);
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
      await this.metadataApiCacheStore.get<TmdbSearchResponse>(
        this.cacheProvider,
        requestKey,
      );

    let payload: TmdbSearchResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const requestParams = new URLSearchParams(params);
      requestParams.set('api_key', apiKey);
      const url = `https://api.themoviedb.org/3/search/${endpoint}?${requestParams.toString()}`;

      payload = (await this.fetchJson(url, 15000)) as TmdbSearchResponse;
      await this.metadataApiCacheStore.set(
        this.cacheProvider,
        requestKey,
        payload,
      );
    }

    const results = Array.isArray(payload.results) ? payload.results : [];

    const candidates = results
      .map((item) => this.toCandidate(item, input.mediaType))
      .filter((candidate): candidate is TmdbCandidate => candidate !== null);

    const exactCandidates = this.filterExactTitleCandidates(candidates, input);
    if (exactCandidates.length === 0) {
      return null;
    }

    const picked = this.pickBestCandidate(exactCandidates, input);
    return {
      title: picked.title,
      tags: picked.tags,
      overview: picked.overview,
      releaseYear: picked.releaseYear,
      posterUrl: picked.posterUrl,
      backdropUrl: picked.backdropUrl,
    };
  }

  private endpointForType(
    mediaType: 'movie' | 'show' | 'other',
  ): 'movie' | 'tv' | 'multi' {
    if (mediaType === 'movie') {
      return 'movie';
    }

    if (mediaType === 'show') {
      return 'tv';
    }

    return 'multi';
  }

  private resolveTmdbSourceId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.floor(value));
    }

    if (typeof value === 'string') {
      const cleaned = value.trim();
      return cleaned ? cleaned : null;
    }

    return null;
  }

  private toCandidate(
    item: unknown,
    mediaType: 'movie' | 'show' | 'other',
  ): TmdbCandidate | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }

    const value = item as Record<string, unknown>;
    const pickedTitle = this.pickTitle(value, mediaType);
    if (!pickedTitle) {
      return null;
    }

    const titlesForMatch = this.collectTitles(value, pickedTitle);
    if (titlesForMatch.length === 0) {
      return null;
    }

    const releaseDate =
      typeof value.release_date === 'string'
        ? value.release_date
        : typeof value.first_air_date === 'string'
          ? value.first_air_date
          : '';
    const candidateMediaType = this.resolveCandidateMediaType(value, mediaType);

    return {
      title: pickedTitle,
      titlesForMatch,
      tags: this.extractTags(value, candidateMediaType),
      overview:
        typeof value.overview === 'string' && value.overview.trim()
          ? value.overview.trim()
          : null,
      releaseYear: this.extractYear(releaseDate),
      posterUrl:
        typeof value.poster_path === 'string' && value.poster_path.trim()
          ? `${this.posterImageBaseUrl}${value.poster_path}`
          : null,
      backdropUrl:
        typeof value.backdrop_path === 'string' && value.backdrop_path.trim()
          ? `${this.backdropImageBaseUrl}${value.backdrop_path}`
          : null,
    };
  }

  private collectTitles(
    value: Record<string, unknown>,
    preferredTitle: string,
  ): string[] {
    const titles = new Set<string>();
    this.addTitle(titles, preferredTitle);
    this.addTitle(titles, value.title);
    this.addTitle(titles, value.name);
    this.addTitle(titles, value.original_title);
    this.addTitle(titles, value.original_name);

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

  private resolveCandidateMediaType(
    value: Record<string, unknown>,
    requestedType: 'movie' | 'show' | 'other',
  ): 'movie' | 'show' | 'other' {
    if (requestedType === 'movie' || requestedType === 'show') {
      return requestedType;
    }

    const rawType =
      typeof value.media_type === 'string'
        ? value.media_type.trim().toLowerCase()
        : '';

    if (rawType === 'movie') {
      return 'movie';
    }

    if (rawType === 'tv') {
      return 'show';
    }

    return 'other';
  }

  private extractTags(
    value: Record<string, unknown>,
    mediaType: 'movie' | 'show' | 'other',
  ): string[] {
    const tags: string[] = [];

    const namedGenres = Array.isArray(value.genres) ? value.genres : [];
    for (const genre of namedGenres) {
      if (typeof genre !== 'object' || genre === null || Array.isArray(genre)) {
        continue;
      }

      const name = (genre as Record<string, unknown>).name;
      if (typeof name !== 'string') {
        continue;
      }

      const cleaned = name.trim();
      if (cleaned) {
        tags.push(cleaned);
      }
    }

    const genreIds =
      Array.isArray(value.genre_ids) && value.genre_ids.length > 0
        ? value.genre_ids
        : [];
    for (const genreId of genreIds) {
      if (typeof genreId !== 'number' || !Number.isFinite(genreId)) {
        continue;
      }

      const id = Math.trunc(genreId);
      const movieGenre = TMDB_MOVIE_GENRES_BY_ID[id] ?? null;
      const showGenre = TMDB_SHOW_GENRES_BY_ID[id] ?? null;

      if (mediaType === 'movie' && movieGenre) {
        tags.push(movieGenre);
        continue;
      }

      if (mediaType === 'show' && showGenre) {
        tags.push(showGenre);
        continue;
      }

      if (mediaType === 'other') {
        if (movieGenre) {
          tags.push(movieGenre);
          continue;
        }

        if (showGenre) {
          tags.push(showGenre);
        }
      }
    }

    return this.normalizeTags(tags);
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
    candidates: TmdbCandidate[],
    input: TmdbLookupInput,
  ): TmdbCandidate[] {
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

  private pickTitle(
    value: Record<string, unknown>,
    mediaType: 'movie' | 'show' | 'other',
  ): string | null {
    const movieTitle = typeof value.title === 'string' ? value.title : null;
    const tvTitle = typeof value.name === 'string' ? value.name : null;

    const picked =
      mediaType === 'movie'
        ? (movieTitle ?? tvTitle)
        : mediaType === 'show'
          ? (tvTitle ?? movieTitle)
          : (movieTitle ?? tvTitle);

    if (!picked) {
      return null;
    }

    const cleaned = picked.trim();
    return cleaned || null;
  }

  private pickBestCandidate(
    candidates: TmdbCandidate[],
    input: TmdbLookupInput,
  ): TmdbCandidate {
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const yearScore =
        input.releaseYear && candidate.releaseYear
          ? input.releaseYear === candidate.releaseYear
            ? 0.7
            : 0
          : 0;

      const posterScore = candidate.posterUrl ? 0.14 : 0;
      const backdropScore = candidate.backdropUrl ? 0.1 : 0;
      const detailScore = candidate.overview ? 0.08 : 0;
      const score = yearScore + posterScore + backdropScore + detailScore;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  private extractYear(value: string): number | null {
    const match = value.match(/^(\d{4})/);
    if (!match) {
      return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractNumericId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const numeric = Math.trunc(value);
      return numeric > 0 ? String(numeric) : null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    if (!cleaned) {
      return null;
    }

    return /^\d+$/.test(cleaned) ? cleaned : null;
  }

  private extractRuntimeSeconds(
    value: {
      runtime?: unknown;
      episode_run_time?: unknown;
    },
    mediaType: 'movie' | 'show',
  ): number | null {
    if (mediaType === 'movie') {
      if (
        typeof value.runtime === 'number' &&
        Number.isFinite(value.runtime) &&
        value.runtime > 0
      ) {
        return Math.round(value.runtime * 60);
      }

      return null;
    }

    if (!Array.isArray(value.episode_run_time)) {
      return null;
    }

    for (const runTime of value.episode_run_time) {
      if (
        typeof runTime === 'number' &&
        Number.isFinite(runTime) &&
        runTime > 0
      ) {
        return Math.round(runTime * 60);
      }
    }

    return null;
  }

  private async discoverRemoteCandidates(
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
        payload = await this.metadataApiCacheStore.get<TmdbSearchResponse>(
          this.cacheProvider,
          requestKey,
        );
      }

      if (payload === undefined) {
        const requestParams = new URLSearchParams(params);
        requestParams.set('api_key', input.apiKey);
        const url = `https://api.themoviedb.org/3/discover/${input.endpoint}?${requestParams.toString()}`;

        payload = (await this.fetchJson(url, 15000)) as TmdbSearchResponse;

        if (input.useCache) {
          await this.metadataApiCacheStore.set(
            this.cacheProvider,
            requestKey,
            payload,
          );
        }
      }

      const rawResults = Array.isArray(payload.results) ? payload.results : [];
      if (rawResults.length === 0) {
        break;
      }

      for (const raw of rawResults) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          continue;
        }

        const value = raw as Record<string, unknown>;
        const providerId = this.extractNumericId(value.id);
        if (!providerId) {
          continue;
        }

        const candidate = this.toCandidate(value, input.mediaType);
        if (!candidate) {
          continue;
        }

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

        if (results.length >= input.limit) {
          return results;
        }
      }
    }

    return results;
  }

  private resolveGenreId(
    normalizedTag: string,
    genresById: Record<number, string>,
  ): number | null {
    const normalizedCandidates = new Set<string>([normalizedTag]);
    this.addTagAliases(normalizedTag, normalizedCandidates);

    for (const candidate of normalizedCandidates) {
      for (const [id, label] of Object.entries(genresById)) {
        const normalizedLabel = this.normalizeGenreLabel(label);
        if (normalizedLabel === candidate) {
          return Number.parseInt(id, 10);
        }
      }
    }

    for (const candidate of normalizedCandidates) {
      for (const [id, label] of Object.entries(genresById)) {
        const normalizedLabel = this.normalizeGenreLabel(label);
        if (
          normalizedLabel.includes(candidate)
          || candidate.includes(normalizedLabel)
        ) {
          return Number.parseInt(id, 10);
        }
      }
    }

    return null;
  }

  private addTagAliases(value: string, bucket: Set<string>): void {
    if (value === 'sci fi' || value === 'scifi') {
      bucket.add('science fiction');
      bucket.add('sci fi fantasy');
    }

    if (value === 'science fiction') {
      bucket.add('sci fi');
      bucket.add('sci fi fantasy');
    }

    if (value === 'action') {
      bucket.add('action adventure');
    }

    if (value === 'fantasy') {
      bucket.add('sci fi fantasy');
    }
  }

  private normalizeGenreLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private cacheKey(
    mediaType: 'movie' | 'show' | 'other',
    title: string,
    releaseYear: number | null,
  ): string {
    return `${mediaType}:${title.toLowerCase()}:${releaseYear ?? 0}`;
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(
          `HTTP ${response.status} from TMDB: ${raw.slice(0, 240)}`,
        );
      }

      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
