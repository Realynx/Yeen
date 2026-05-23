import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import {
  JikanMetadataService,
  type JikanRemoteCandidate,
} from '../remote-metadata/jikan-metadata.service';
import {
  TmdbMetadataService,
  type TmdbRemoteCandidate,
} from '../remote-metadata/tmdb-metadata.service';

type RemoteMediaProvider = 'tmdb' | 'jikan';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

interface ParsedRemoteMediaId {
  provider: RemoteMediaProvider;
  mediaType: 'movie' | 'show';
  providerId: string;
}

@Injectable()
export class MediaRemoteCatalogService {
  constructor(
    private readonly mediaStore: MediaStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
  ) {}

  async searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }) {
    const normalizeExactTitle = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const requestedLimit = Math.max(1, Math.min(input.limit ?? 8, 20));
    const providerLimit = Math.max(6, Math.min(requestedLimit * 2, 24));
    const includeJikan = input.type === 'show' || input.type === 'other';

    const [tmdbCandidates, jikanCandidates] = await Promise.all([
      this.tmdbMetadataService.searchCandidates({
        title: input.title,
        mediaType: input.type,
        releaseYear: input.year,
        limit: providerLimit,
      }),
      includeJikan
        ? this.jikanMetadataService.searchCandidates({
            title: input.title,
            limit: providerLimit,
            useCache: true,
          })
        : Promise.resolve<JikanRemoteCandidate[]>([]),
    ]);

    const mappedJikanCandidates = jikanCandidates
      .filter((candidate) =>
        input.type === 'other' ? true : candidate.mediaType === input.type,
      )
      .map((candidate) => ({
        title: candidate.title,
        mediaType: candidate.mediaType,
        tags: candidate.tags,
        overview: candidate.overview,
        releaseYear: candidate.releaseYear,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        remoteSource: 'jikan' as const,
        remoteSourceId: candidate.providerId,
      }));

    const topJikanCandidate = mappedJikanCandidates[0] ?? null;
    const inputTitleKey = normalizeExactTitle(input.title);
    const topJikanIsPerfectMatch =
      topJikanCandidate !== null &&
      inputTitleKey.length > 0 &&
      normalizeExactTitle(topJikanCandidate.title) === inputTitleKey;
    const curatedJikanCandidates =
      topJikanIsPerfectMatch && topJikanCandidate ? [topJikanCandidate] : [];

    const orderedCandidates = [...curatedJikanCandidates, ...tmdbCandidates];

    const seen = new Set<string>();
    const candidates: Array<{
      title: string;
      mediaType: 'movie' | 'show' | 'other';
      tags: string[];
      overview: string | null;
      releaseYear: number | null;
      posterUrl: string | null;
      backdropUrl: string | null;
      remoteSource: 'tmdb' | 'jikan';
      remoteSourceId: string;
    }> = [];

    for (const candidate of orderedCandidates) {
      const key = `${candidate.remoteSource}:${candidate.remoteSourceId}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push(candidate);

      if (candidates.length >= requestedLimit) {
        break;
      }
    }

    return { candidates };
  }

  async searchRemoteMediaCatalog(input: {
    query: string;
    limit?: number;
    page?: number;
    providers?: RemoteMediaProvider[];
    tags?: string[];
    useCache?: boolean;
  }): Promise<{
    query: string;
    providers: RemoteMediaProvider[];
    total: number;
    page: number;
    hasMore: boolean;
    items: MediaItem[];
  }> {
    const cleanedQuery = input.query.trim();
    const useCache = input.useCache !== false;
    const providers = this.normalizeRemoteProviders(input.providers);
    const requestedTags = this.normalizeTagFilters(input.tags);
    const requestLimit = Math.max(1, Math.min(input.limit ?? 24, 72));
    const requestPage = Math.max(1, Math.floor(input.page ?? 1));
    const resultOffset = (requestPage - 1) * requestLimit;
    const isTagExploreMode =
      cleanedQuery.length === 0 && requestedTags.length > 0;
    const searchProbes = this.buildRemoteSearchProbes(
      cleanedQuery,
      requestedTags,
    );

    if (searchProbes.length === 0) {
      return {
        query: cleanedQuery,
        providers,
        total: 0,
        page: requestPage,
        hasMore: false,
        items: [],
      };
    }

    const localItems = await this.mediaStore.all();
    const localTitleIndex = this.buildLocalTitleIndex(localItems);
    const requiredItemCount = resultOffset + requestLimit;
    const providerLimit =
      requestedTags.length > 0
        ? isTagExploreMode
          ? requestLimit
          : Math.min(480, Math.max(requiredItemCount * 2, 48))
        : Math.min(320, Math.max(requiredItemCount, 28));
    const browseTags = requestedTags.slice(0, 3);
    const shouldRunProbeSearch = !isTagExploreMode;

    const [
      tmdbCandidates,
      jikanCandidates,
      tmdbTagCandidates,
      jikanTagCandidates,
    ] = await Promise.all([
      providers.includes('tmdb') && shouldRunProbeSearch
        ? this.collectTmdbRemoteCandidates(
            searchProbes,
            providerLimit,
            useCache,
          )
        : Promise.resolve<TmdbRemoteCandidate[]>([]),
      providers.includes('jikan') && shouldRunProbeSearch
        ? this.collectJikanRemoteCandidates(
            searchProbes,
            providerLimit,
            useCache,
          )
        : Promise.resolve<JikanRemoteCandidate[]>([]),
      providers.includes('tmdb') && browseTags.length > 0
        ? this.collectTmdbRemoteTagCandidates(
            browseTags,
            providerLimit,
            useCache,
            requestPage,
          )
        : Promise.resolve<TmdbRemoteCandidate[]>([]),
      providers.includes('jikan') && browseTags.length > 0
        ? this.collectJikanRemoteTagCandidates(
            browseTags,
            providerLimit,
            useCache,
            requestPage,
          )
        : Promise.resolve<JikanRemoteCandidate[]>([]),
    ]);

    const combined = [
      ...tmdbCandidates,
      ...jikanCandidates,
      ...tmdbTagCandidates,
      ...jikanTagCandidates,
    ];
    const deduped = new Map<string, RemoteMediaCandidate>();

    for (const candidate of combined) {
      if (!this.hasUsefulRemoteCandidate(candidate)) {
        continue;
      }

      if (!this.matchesRemoteTagFilters(candidate, requestedTags)) {
        continue;
      }

      if (
        !isTagExploreMode &&
        this.isAlreadyIndexedLocally(candidate, localTitleIndex)
      ) {
        continue;
      }

      const key = this.remoteCandidateDedupeKey(candidate);
      const existing = deduped.get(key);

      if (!existing) {
        deduped.set(key, candidate);
        continue;
      }

      if (
        this.remoteCandidateScore(candidate) >
        this.remoteCandidateScore(existing)
      ) {
        deduped.set(key, candidate);
      }
    }

    const sortedCandidates = [...deduped.values()].sort((left, right) => {
      const scoreDelta =
        this.remoteCandidateScore(right) - this.remoteCandidateScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.title.localeCompare(right.title, undefined, {
        sensitivity: 'base',
      });
    });

    const sliceOffset = isTagExploreMode ? 0 : resultOffset;
    const pagedCandidates = sortedCandidates.slice(
      sliceOffset,
      sliceOffset + requestLimit,
    );
    const items = pagedCandidates.map((candidate) =>
      this.toRemoteMediaItem(candidate),
    );
    const hasMore = isTagExploreMode
      ? items.length > 0
      : sortedCandidates.length > resultOffset + requestLimit;

    return {
      query: cleanedQuery,
      providers,
      total: sortedCandidates.length,
      page: requestPage,
      hasMore,
      items,
    };
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    const parsed = this.parseRemoteMediaId(remoteId);
    if (!parsed) {
      throw new NotFoundException('Remote media item not found.');
    }

    let candidate: RemoteMediaCandidate | null = null;

    if (parsed.provider === 'tmdb') {
      candidate = await this.tmdbMetadataService.getRemoteDetails({
        providerId: parsed.providerId,
        mediaType: parsed.mediaType,
      });
    } else {
      candidate = await this.jikanMetadataService.getRemoteDetails(
        parsed.providerId,
      );

      if (candidate && candidate.mediaType !== parsed.mediaType) {
        candidate = {
          ...candidate,
          mediaType: parsed.mediaType,
        };
      }
    }

    if (!candidate) {
      throw new NotFoundException('Remote media item not found.');
    }

    return this.toRemoteMediaItem(candidate);
  }

  private normalizeTagFilters(tags?: string[]): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const normalized = new Set<string>();
    for (const rawTag of tags) {
      if (typeof rawTag !== 'string') {
        continue;
      }

      const splitValues = rawTag.split(',');
      for (const splitValue of splitValues) {
        const cleaned = splitValue.trim().toLowerCase();
        if (cleaned) {
          normalized.add(cleaned);
        }
      }
    }

    return [...normalized];
  }

  private normalizeRemoteProviders(
    providers: readonly RemoteMediaProvider[] | undefined,
  ): RemoteMediaProvider[] {
    if (!Array.isArray(providers) || providers.length === 0) {
      return ['tmdb', 'jikan'];
    }

    const deduped = new Set<RemoteMediaProvider>();
    for (const provider of providers) {
      if (typeof provider !== 'string') {
        continue;
      }

      if (provider === 'tmdb' || provider === 'jikan') {
        deduped.add(provider);
      }
    }

    return deduped.size > 0 ? [...deduped] : ['tmdb', 'jikan'];
  }

  private buildRemoteSearchProbes(
    query: string,
    requestedTags: readonly string[],
  ): string[] {
    const probes = new Set<string>();

    const addProbe = (value: string) => {
      const cleaned = value.trim();
      if (cleaned.length >= 2) {
        probes.add(cleaned);
      }
    };

    addProbe(query);

    for (const tag of requestedTags) {
      addProbe(tag);

      const tokenized = tag
        .split(/[^a-z0-9]+/i)
        .map((value) => value.trim())
        .filter((value) => value.length >= 3)
        .slice(0, 4);

      if (tokenized.length >= 2) {
        addProbe(tokenized.join(' '));
      }
    }

    return [...probes].slice(0, 4);
  }

  private async collectTmdbRemoteCandidates(
    searchProbes: readonly string[],
    providerLimit: number,
    useCache: boolean,
  ): Promise<TmdbRemoteCandidate[]> {
    const candidates: TmdbRemoteCandidate[] = [];

    for (const probe of searchProbes) {
      const payload = await this.tmdbMetadataService.searchRemoteCandidates({
        title: probe,
        limit: providerLimit,
        useCache,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectJikanRemoteCandidates(
    searchProbes: readonly string[],
    providerLimit: number,
    useCache: boolean,
  ): Promise<JikanRemoteCandidate[]> {
    const candidates: JikanRemoteCandidate[] = [];

    for (const probe of searchProbes) {
      const payload = await this.jikanMetadataService.searchCandidates({
        title: probe,
        limit: providerLimit,
        useCache,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectTmdbRemoteTagCandidates(
    tags: readonly string[],
    providerLimit: number,
    useCache: boolean,
    page: number,
  ): Promise<TmdbRemoteCandidate[]> {
    const candidates: TmdbRemoteCandidate[] = [];

    for (const tag of tags) {
      const payload =
        await this.tmdbMetadataService.searchRemoteCandidatesByTag({
          tag,
          limit: providerLimit,
          useCache,
          page,
        });
      candidates.push(...payload);
    }

    return candidates;
  }

  private async collectJikanRemoteTagCandidates(
    tags: readonly string[],
    providerLimit: number,
    useCache: boolean,
    page: number,
  ): Promise<JikanRemoteCandidate[]> {
    const candidates: JikanRemoteCandidate[] = [];

    for (const tag of tags) {
      const payload = await this.jikanMetadataService.searchCandidatesByTag({
        tag,
        limit: providerLimit,
        useCache,
        page,
      });
      candidates.push(...payload);
    }

    return candidates;
  }

  private matchesRemoteTagFilters(
    candidate: RemoteMediaCandidate,
    requestedTags: readonly string[],
  ): boolean {
    if (requestedTags.length === 0) {
      return true;
    }

    const candidateTags = this.toNormalizedTagSet(candidate.tags);
    if (candidateTags.size === 0) {
      return false;
    }

    return requestedTags.some((tag) => candidateTags.has(tag));
  }

  private hasUsefulRemoteCandidate(candidate: RemoteMediaCandidate): boolean {
    const title = candidate.title.trim();
    if (!title) {
      return false;
    }

    if (candidate.mediaType !== 'movie' && candidate.mediaType !== 'show') {
      return false;
    }

    return true;
  }

  private parseRemoteMediaId(mediaId: string): ParsedRemoteMediaId | null {
    const cleanedId = mediaId.trim();
    const match = cleanedId.match(
      /^remote_(tmdb|jikan)_(movie|show)_([A-Za-z0-9-]{1,64})$/,
    );

    if (!match) {
      return null;
    }

    return {
      provider: match[1] as RemoteMediaProvider,
      mediaType: match[2] as 'movie' | 'show',
      providerId: match[3],
    };
  }

  private toRemoteMediaItem(candidate: RemoteMediaCandidate): MediaItem {
    const now = new Date().toISOString();
    const sourceLabel = this.remoteSourceLabel(candidate.provider);

    return {
      id: `remote_${candidate.provider}_${candidate.mediaType}_${candidate.providerId}`,
      title: candidate.title,
      normalizedTitle: normalizeForKey(candidate.title),
      tags: this.normalizeEditableTags(candidate.tags ?? []),
      description: candidate.overview,
      releaseYear: candidate.releaseYear,
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      dedupeKey: `remote:${candidate.provider}:${candidate.mediaType}:${candidate.providerId}`,
      relativePath: `Remote catalog result (${sourceLabel})`,
      filePath: `remote://${candidate.provider}/${candidate.providerId}`,
      extension: '.api',
      container: null,
      type: candidate.mediaType,
      digitalMediaType: 'video',
      sizeBytes: 0,
      durationSeconds:
        typeof candidate.runtimeSeconds === 'number' &&
        Number.isFinite(candidate.runtimeSeconds) &&
        candidate.runtimeSeconds > 0
          ? Math.round(candidate.runtimeSeconds)
          : 0,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      subtitleStreams: 0,
      subtitleDetails: [],
      previewImagePath: candidate.posterUrl,
      backdropImagePath: candidate.backdropUrl,
      chapterThumbnails: [],
      mediaDetails: {
        formatName: null,
        bitRate: null,
        frameRate: null,
        audioChannels: null,
      },
      metadataRefreshedAt: now,
      updatedAt: now,
      isRemote: true,
      remoteSource: candidate.provider,
      remoteSourceId: candidate.providerId,
      remoteSourceLabel: sourceLabel,
    };
  }

  private normalizeEditableTags(tags: readonly string[]): string[] {
    const deduped = new Map<string, string>();
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        continue;
      }
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

  private remoteSourceLabel(provider: RemoteMediaProvider): string {
    return provider === 'tmdb' ? 'TMDB' : 'Jikan';
  }

  private normalizeRemoteTitleForKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private remoteCandidateDedupeKey(candidate: RemoteMediaCandidate): string {
    const normalizedTitle = this.normalizeRemoteTitleForKey(candidate.title);
    const year =
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
        ? Math.floor(candidate.releaseYear)
        : 0;

    return `${candidate.mediaType}:${normalizedTitle}:y${year}`;
  }

  private buildLocalTitleIndex(
    items: MediaItem[],
  ): Map<string, Set<number | null>> {
    const index = new Map<string, Set<number | null>>();

    for (const item of items) {
      const mediaType: 'movie' | 'show' =
        item.type === 'show' ? 'show' : 'movie';
      const normalizedTitle = this.normalizeRemoteTitleForKey(item.title);
      if (!normalizedTitle) {
        continue;
      }

      const key = `${mediaType}:${normalizedTitle}`;
      const years = index.get(key) ?? new Set<number | null>();
      const year =
        typeof item.releaseYear === 'number' &&
        Number.isFinite(item.releaseYear)
          ? Math.floor(item.releaseYear)
          : null;

      years.add(year);
      index.set(key, years);
    }

    return index;
  }

  private isAlreadyIndexedLocally(
    candidate: RemoteMediaCandidate,
    localTitleIndex: Map<string, Set<number | null>>,
  ): boolean {
    const normalizedTitle = this.normalizeRemoteTitleForKey(candidate.title);
    if (!normalizedTitle) {
      return false;
    }

    const titleKey = `${candidate.mediaType}:${normalizedTitle}`;
    const knownYears = localTitleIndex.get(titleKey);
    if (!knownYears || knownYears.size === 0) {
      return false;
    }

    const candidateYear =
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
        ? Math.floor(candidate.releaseYear)
        : null;

    if (knownYears.has(candidateYear)) {
      return true;
    }

    if (candidateYear === null || knownYears.has(null)) {
      return true;
    }

    return false;
  }

  private remoteCandidateScore(candidate: RemoteMediaCandidate): number {
    let score = 0;

    if (candidate.posterUrl) {
      score += 4;
    }
    if (candidate.backdropUrl) {
      score += 3;
    }
    if (candidate.overview) {
      score += 2;
    }
    if (candidate.releaseYear) {
      score += 1;
    }
    if (candidate.runtimeSeconds && candidate.runtimeSeconds > 0) {
      score += 1;
    }
    if (candidate.provider === 'tmdb') {
      score += 0.25;
    }

    return score;
  }

  private toNormalizedTagSet(
    tags: readonly string[] | null | undefined,
  ): Set<string> {
    const normalized = new Set<string>();

    if (!Array.isArray(tags) || tags.length === 0) {
      return normalized;
    }

    for (const tag of tags) {
      if (typeof tag !== 'string') {
        continue;
      }

      const cleaned = tag.trim().toLowerCase();
      if (cleaned) {
        normalized.add(cleaned);
      }
    }

    return normalized;
  }
}
