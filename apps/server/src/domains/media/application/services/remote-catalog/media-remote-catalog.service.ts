import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import {
  JikanMetadataService,
  type JikanRemoteCandidate,
} from '../remote-metadata/jikan-metadata.service';
import { AniListCatalogService } from '../remote-metadata/anilist-catalog.service';
import {
  TmdbMetadataService,
  type TmdbRemoteCandidate,
} from '../remote-metadata/tmdb-metadata.service';
import {
  remoteCandidateDedupKeyValue,
  buildLocalTitleIndexValue,
  isAlreadyIndexedLocallyValue,
} from './media-remote-catalog-deduplication.helpers';
import {
  parseRemoteMediaIdValue,
  toRemoteMediaItemValue,
  remoteSourceLabelValue,
} from './media-remote-catalog-conversion.helpers';
import {
  normalizeTagFiltersValue,
  normalizeRemoteProvidersValue,
  matchesRemoteTagFiltersValue,
  hasUsefulRemoteCandidateValue,
  remoteCandidateScoreValue,
  type RemoteMediaProvider,
} from './media-remote-catalog-filtering.helpers';
import {
  buildRemoteSearchProbesValue,
  collectTmdbRemoteCandidatesValue,
  collectJikanRemoteCandidatesValue,
  collectTmdbRemoteTagCandidatesValue,
} from './media-remote-catalog-search.helpers';
import { normalizeExactTitleValue } from './media-remote-catalog-exact-title.helpers';
import {
  processCandidatesForCatalogValue,
  sliceAndConvertCandidatesValue,
} from './media-remote-catalog-catalog-processing.helpers';

type RemoteMediaCandidate = TmdbRemoteCandidate | JikanRemoteCandidate;

function resolveProviderLimitValue(
  hasTags: boolean,
  tagExploreMode: boolean,
  requestLimit: number,
  requiredItemCount: number,
): number {
  if (!hasTags) return Math.min(320, Math.max(requiredItemCount, 28));
  if (tagExploreMode) return requestLimit;
  return Math.min(480, Math.max(requiredItemCount * 2, 48));
}

@Injectable()
export class MediaRemoteCatalogService {
  constructor(
    private readonly mediaStore: MediaStore,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly aniListCatalogService: AniListCatalogService,
  ) {}

  async searchMetadataCandidates(input: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year: number | null;
    limit?: number;
  }) {
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
    const inputTitleKey = normalizeExactTitleValue(input.title);
    const topJikanIsPerfectMatch =
      topJikanCandidate !== null &&
      inputTitleKey.length > 0 &&
      normalizeExactTitleValue(topJikanCandidate.title) === inputTitleKey;
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
    const providers = normalizeRemoteProvidersValue(input.providers);
    const requestedTags = normalizeTagFiltersValue(input.tags);
    const requestLimit = Math.max(1, Math.min(input.limit ?? 24, 72));
    const requestPage = Math.max(1, Math.floor(input.page ?? 1));
    const resultOffset = (requestPage - 1) * requestLimit;
    const isTagExploreMode =
      cleanedQuery.length === 0 && requestedTags.length > 0;
    const searchProbes = buildRemoteSearchProbesValue(
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
    const localTitleIndex = buildLocalTitleIndexValue(localItems);
    const requiredItemCount = resultOffset + requestLimit;
    const providerLimit = resolveProviderLimitValue(
      requestedTags.length > 0,
      isTagExploreMode,
      requestLimit,
      requiredItemCount,
    );
    const browseTags = requestedTags.slice(0, 3);
    const shouldRunProbeSearch = !isTagExploreMode;

    const combined = await this.collectCatalogCandidates({
      providers,
      shouldRunProbeSearch,
      searchProbes,
      browseTags,
      providerLimit,
      useCache,
      requestPage,
    });

    const sortedCandidates = processCandidatesForCatalogValue(
      combined,
      requestedTags,
      isTagExploreMode,
      localTitleIndex,
      (c) => hasUsefulRemoteCandidateValue(c),
      (c, tags) => matchesRemoteTagFiltersValue(c, tags),
      (c, idx) => isAlreadyIndexedLocallyValue(c, idx),
      (c) => remoteCandidateDedupKeyValue(c),
      (c) => remoteCandidateScoreValue(c),
    );

    const sliceOffset = isTagExploreMode ? 0 : resultOffset;
    const items = sliceAndConvertCandidatesValue(
      sortedCandidates,
      sliceOffset,
      requestLimit,
      (c) => this.toRemoteMediaItem(c),
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

  private async collectCatalogCandidates(input: {
    providers: RemoteMediaProvider[];
    shouldRunProbeSearch: boolean;
    searchProbes: string[];
    browseTags: string[];
    providerLimit: number;
    useCache: boolean;
    requestPage: number;
  }): Promise<RemoteMediaCandidate[]> {
    const tmdbEnabled = input.providers.includes('tmdb');
    const jikanEnabled = input.providers.includes('jikan');
    const hasTags = input.browseTags.length > 0;
    const empty = (): Promise<RemoteMediaCandidate[]> => Promise.resolve([]);
    const batches = await Promise.all([
      tmdbEnabled && input.shouldRunProbeSearch
        ? collectTmdbRemoteCandidatesValue(
            input.searchProbes,
            input.providerLimit,
            input.useCache,
            this.tmdbMetadataService,
          )
        : empty(),
      jikanEnabled && input.shouldRunProbeSearch
        ? collectJikanRemoteCandidatesValue(
            input.searchProbes,
            input.providerLimit,
            input.useCache,
            this.jikanMetadataService,
          )
        : empty(),
      tmdbEnabled && hasTags
        ? collectTmdbRemoteTagCandidatesValue(
            input.browseTags,
            input.providerLimit,
            input.useCache,
            input.requestPage,
            this.tmdbMetadataService,
          )
        : empty(),
      jikanEnabled && hasTags
        ? Promise.all(
            input.browseTags.map((tag) =>
              this.aniListCatalogService.searchCandidatesByTag({
                tag,
                limit: input.providerLimit,
                useCache: input.useCache,
                page: input.requestPage,
              }),
            ),
          ).then((pages) => pages.flat())
        : empty(),
    ]);
    return batches.flat();
  }

  async getRemoteMediaById(remoteId: string): Promise<MediaItem> {
    const parsed = parseRemoteMediaIdValue(remoteId);
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
      candidate =
        (await this.aniListCatalogService.getRemoteDetails(
          parsed.providerId,
        )) ??
        (await this.jikanMetadataService.getRemoteDetails(parsed.providerId));

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

  private toRemoteMediaItem(candidate: RemoteMediaCandidate): MediaItem {
    const sourceLabel =
      'catalogSourceLabel' in candidate && candidate.catalogSourceLabel
        ? candidate.catalogSourceLabel
        : remoteSourceLabelValue(candidate.provider);
    return toRemoteMediaItemValue(candidate, sourceLabel);
  }
}
