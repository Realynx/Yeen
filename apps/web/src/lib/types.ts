export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type DigitalMediaType = 'video' | 'audio' | 'image' | 'other';

export interface MediaSubtitleDetail {
  kind: 'embedded' | 'external';
  label: string;
  language: string | null;
  source: string;
}

export interface MediaDetails {
  formatName: string | null;
  bitRate: number | null;
  frameRate: number | null;
  audioChannels: number | null;
}

export interface MediaChapterThumbnail {
  imagePath: string;
  second: number;
}

export interface MediaItem {
  id: string;
  title: string;
  normalizedTitle: string;
  tags: string[];
  description: string | null;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  dedupeKey: string;
  relativePath: string;
  filePath: string;
  extension: string;
  container: string | null;
  type: 'movie' | 'show' | 'other';
  digitalMediaType: DigitalMediaType;
  sizeBytes: number;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  subtitleStreams: number;
  subtitleDetails: MediaSubtitleDetail[];
  previewImagePath: string | null;
  backdropImagePath: string | null;
  chapterThumbnails: MediaChapterThumbnail[];
  mediaDetails: MediaDetails;
  metadataRefreshedAt: string;
  updatedAt: string;
}

export interface PlaybackPlan {
  mediaId: string;
  title: string;
  directPlay: {
    supported: boolean;
    url: string;
  };
  hls: {
    startUrl: string;
  };
  subtitles: {
    listUrl: string;
  };
}

export interface HlsStartResponse {
  sessionId: string;
  manifestUrl: string;
}

export interface SubtitleTrack {
  id: string;
  kind: 'embedded' | 'external';
  label: string;
  language: string | null;
  format: string;
  extractable: boolean;
  streamIndex?: number;
  url: string | null;
}

export interface ProgressEntry {
  userId: string;
  mediaId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface MediaLocationsResponse {
  locations: string[];
  source: 'settings' | 'env';
}

export interface MediaStats {
  indexedItems: number;
}

export interface ApiCacheClearResult {
  persistedEntriesCleared: number;
  inMemoryEntriesCleared: number;
  message: string;
}

export interface MediaMetadataClearResult {
  removedEntries: number;
  message: string;
}

export interface MediaScanProgress {
  scanId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  phase: 'idle' | 'collecting' | 'probing' | 'saving' | 'completed' | 'failed';
  libraryPaths: string[];
  totalFiles: number;
  processedFiles: number;
  indexedItems: number;
  failedFiles: number;
  currentFile: string | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  scannedAt: string | null;
}

export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  tmdbApiKey: string;
  openSubtitlesApiKey: string;
  transcodePreset: string;
  transcodeCrf: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}
