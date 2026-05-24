export interface TmdbSearchResponse {
  results?: unknown[];
}

export interface TmdbDetailsResponse {
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

export interface TmdbSeasonDetailsResponse {
  season_number?: unknown;
  episodes?: unknown[];
}

export interface TmdbCandidate {
  title: string;
  titlesForMatch: string[];
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

export interface TmdbLookupInput {
  title: string;
  mediaType: 'movie' | 'show' | 'other';
  releaseYear: number | null;
}

export interface TmdbLookupResult {
  providerId: string;
  title: string;
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

export interface TmdbSeriesEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airedAt: string | null;
  synopsis: string | null;
}

export interface TmdbSeriesEpisodeCatalog {
  providerId: string;
  totalEpisodeCount: number;
  episodes: TmdbSeriesEpisode[];
  updatedAt: string;
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

export interface TmdbDiscoverInput {
  apiKey: string;
  endpoint: 'movie' | 'tv';
  mediaType: 'movie' | 'show';
  genreId: number;
  limit: number;
  page?: number;
  useCache: boolean;
}

export const TMDB_MOVIE_GENRES_BY_ID: Record<number, string> = {
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

export const TMDB_SHOW_GENRES_BY_ID: Record<number, string> = {
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
