export interface JikanSearchResponse {
  data?: unknown[];
}

export interface JikanDetailsResponse {
  data?: unknown;
}

export interface JikanEpisodesResponse {
  data?: unknown[];
  pagination?: unknown;
}

export interface JikanGenreCatalogResponse {
  data?: unknown[];
}

export interface JikanCandidate {
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

export interface JikanLookupInput {
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
  /** Discovery may come from AniList while the stable identifier remains a MAL id. */
  catalogSourceLabel?: 'AniList';
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

export const JIKAN_GENRES_BY_ID: Record<number, string> = {
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
