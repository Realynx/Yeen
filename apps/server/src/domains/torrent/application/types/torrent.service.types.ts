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

export interface TorrentListItem {
  hash: string;
  name: string;
  state: string;
  progress: number;
  etaSeconds: number;
  downloadRate: number;
  uploadRate: number;
  sizeBytes: number;
  completedBytes: number;
  savePath: string | null;
  sequentialDownload: boolean | null;
  firstLastPiecePriority: boolean | null;
}

export interface TorrentPaths {
  savePath: string | null;
  contentPath: string | null;
}
