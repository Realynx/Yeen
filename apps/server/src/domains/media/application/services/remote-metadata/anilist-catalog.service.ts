import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import type { JikanRemoteCandidate } from './jikan-metadata.types';

interface AniListPagePayload {
  data?: {
    Page?: {
      pageInfo?: { hasNextPage?: boolean };
      media?: unknown[];
    };
    genrePage?: {
      pageInfo?: { hasNextPage?: boolean };
      media?: unknown[];
    };
    tagPage?: {
      pageInfo?: { hasNextPage?: boolean };
      media?: unknown[];
    };
    Media?: unknown;
  };
  errors?: Array<{ message?: string }>;
}

interface AniListSearchInput {
  tag: string;
  limit?: number;
  page?: number;
  useCache?: boolean;
}

const CATALOG_MEDIA_FIELDS = `
      idMal
      format
      title { romaji english native }
      description
      seasonYear
      duration
      genres
      tags { name rank }
      coverImage { extraLarge large }
      bannerImage
`;

const SEARCH_QUERY = `
  query AnimeCatalog($page: Int!, $perPage: Int!, $tag: String!) {
    genrePage: Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: ANIME
        genre: $tag
        isAdult: false
        sort: [POPULARITY_DESC, SCORE_DESC]
      ) {
${CATALOG_MEDIA_FIELDS}
      }
    }
    tagPage: Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: ANIME
        tag: $tag
        isAdult: false
        sort: [POPULARITY_DESC, SCORE_DESC]
      ) {
${CATALOG_MEDIA_FIELDS}
      }
    }
  }
`;

const DETAILS_QUERY = `
  query AnimeDetails($malId: Int!) {
    Media(idMal: $malId, type: ANIME) {
      idMal
      format
      title { romaji english native }
      description
      seasonYear
      duration
      genres
      tags { name rank }
      coverImage { extraLarge large }
      bannerImage
    }
  }
`;

@Injectable()
export class AniListCatalogService {
  private readonly logger = new Logger(AniListCatalogService.name);
  private readonly cacheProvider = 'anilist.anime';

  constructor(private readonly cacheStore: MetadataApiCacheStore) {}

  async searchCandidatesByTag(
    input: AniListSearchInput,
  ): Promise<JikanRemoteCandidate[]> {
    const tag = input.tag.trim();
    if (tag.length < 2) return [];

    const page = normalizePositiveInteger(input.page, 1, 1_000);
    const perPage = normalizePositiveInteger(input.limit, 20, 50);
    const variables = { page, perPage, tag };
    const requestKey = `tag-v2:${JSON.stringify(variables)}`;
    const cached = await this.cacheStore.get<AniListPagePayload>(
      this.cacheProvider,
      requestKey,
    );

    if (input.useCache !== false && cached !== undefined) {
      return candidatesFromCatalogPayload(cached);
    }

    try {
      const payload = await this.fetchGraphql(SEARCH_QUERY, variables);
      await this.cacheStore.set(this.cacheProvider, requestKey, payload);
      return candidatesFromCatalogPayload(payload);
    } catch (error) {
      if (cached !== undefined) {
        this.logger.warn(
          `AniList refresh failed for "${tag}"; serving the last successful page.`,
        );
        return candidatesFromCatalogPayload(cached);
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AniList catalog search failed for "${tag}": ${message}`,
      );
      throw new ServiceUnavailableException(
        'The anime catalog provider is temporarily unavailable. Please try again shortly.',
      );
    }
  }

  async getRemoteDetails(
    providerId: string,
  ): Promise<JikanRemoteCandidate | null> {
    const malId = normalizePositiveInteger(Number(providerId), 0, 10_000_000);
    if (malId <= 0) return null;

    const requestKey = `details:mal:${malId}`;
    const cached = await this.cacheStore.get<AniListPagePayload>(
      this.cacheProvider,
      requestKey,
    );
    if (cached !== undefined) {
      return candidateFromUnknown(cached.data?.Media);
    }

    try {
      const payload = await this.fetchGraphql(DETAILS_QUERY, { malId });
      await this.cacheStore.set(this.cacheProvider, requestKey, payload);
      return candidateFromUnknown(payload.data?.Media);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AniList details lookup failed for MAL ${malId}: ${message}`,
      );
      return null;
    }
  }

  private async fetchGraphql(
    query: string,
    variables: Record<string, string | number>,
  ): Promise<AniListPagePayload> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15_000);

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: abortController.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} from AniList: ${raw.slice(0, 240)}`,
        );
      }

      const payload = JSON.parse(raw) as AniListPagePayload;
      const graphqlError = payload.errors?.find(
        (entry) => entry.message,
      )?.message;
      if (graphqlError) {
        throw new Error(`AniList GraphQL error: ${graphqlError}`);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(maximum, Math.floor(value)))
    : fallback;
}

function candidatesFromCatalogPayload(
  payload: AniListPagePayload,
): JikanRemoteCandidate[] {
  const media = [
    ...(payload.data?.Page?.media ?? []),
    ...(payload.data?.genrePage?.media ?? []),
    ...(payload.data?.tagPage?.media ?? []),
  ];
  const candidates = media
    .map((entry) => candidateFromUnknown(entry))
    .filter((entry): entry is JikanRemoteCandidate => entry !== null);
  return deduplicateCandidates(candidates);
}

function deduplicateCandidates(
  candidates: readonly JikanRemoteCandidate[],
): JikanRemoteCandidate[] {
  const byProviderId = new Map<string, JikanRemoteCandidate>();
  for (const candidate of candidates) {
    if (!byProviderId.has(candidate.providerId)) {
      byProviderId.set(candidate.providerId, candidate);
    }
  }
  return [...byProviderId.values()];
}

function candidateFromUnknown(value: unknown): JikanRemoteCandidate | null {
  const row = asRecord(value);
  const providerId = positiveInteger(row?.idMal);
  const titleRow = asRecord(row?.title);
  const title = firstString(
    titleRow?.english,
    titleRow?.romaji,
    titleRow?.native,
  );
  if (!row || !providerId || !title) return null;

  const durationMinutes = positiveInteger(row.duration);
  return {
    provider: 'jikan',
    providerId: String(providerId),
    catalogSourceLabel: 'AniList',
    title,
    mediaType: row.format === 'MOVIE' ? 'movie' : 'show',
    tags: collectTags(row),
    overview: cleanDescription(row.description),
    releaseYear: positiveInteger(row.seasonYear),
    posterUrl: firstString(
      asRecord(row.coverImage)?.extraLarge,
      asRecord(row.coverImage)?.large,
    ),
    backdropUrl: firstString(row.bannerImage),
    runtimeSeconds: durationMinutes ? durationMinutes * 60 : null,
  };
}

function collectTags(row: Record<string, unknown>): string[] {
  const tags = new Map<string, string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const cleaned = value.trim();
    if (cleaned && !tags.has(cleaned.toLowerCase())) {
      tags.set(cleaned.toLowerCase(), cleaned);
    }
  };

  if (Array.isArray(row.genres)) row.genres.forEach(add);
  if (Array.isArray(row.tags)) {
    for (const value of row.tags) add(asRecord(value)?.name);
  }
  return [...tags.values()];
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
