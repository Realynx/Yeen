// Shared types pulled out to avoid circular imports between torrent.service.ts
// and its persistence stores.

export interface TorrentFileHint {
  name: string;
  size: number;
}

export interface TorrentMediaHint {
  title: string;
  normalizedTitle: string;
  releaseYear: number | null;
  mediaType: 'movie' | 'show' | 'other' | null;
  description: string | null;
  tags: string[];
  posterUrl: string | null;
  backdropUrl: string | null;
  remoteSource: 'tmdb' | 'jikan' | null;
  remoteSourceId: string | null;
}
