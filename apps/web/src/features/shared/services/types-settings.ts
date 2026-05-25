export interface MediaScanProgress {
  scanId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  phase: 'idle' | 'collecting' | 'probing' | 'saving' | 'completed' | 'failed';
  libraryPaths: string[];
  totalFiles: number;
  processedFiles: number;
  indexedItems: number;
  failedFiles: number;
  skippedIndexedFiles: number;
  currentFile: string | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  scannedAt: string | null;
}

export interface QbittorrentPathMapping {
  from: string;
  to: string;
}

export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  tmdbApiKey: string;
  openSubtitlesApiKey: string;
  qbittorrentBaseUrl: string;
  qbittorrentUsername: string;
  qbittorrentPassword: string;
  qbittorrentRequestTimeoutMs: number;
  qbittorrentDefaultOrderMode: 'sequential' | 'random';
  qbittorrentPathMappings: QbittorrentPathMapping[];
  iptorrentsUsername: string;
  iptorrentsPassword: string;
  iptorrentsSeedingEnabled: boolean;
  nyaaSeedingEnabled: boolean;
  transcodePreset: string;
  transcodeCrf: number;
  transcodeDefaultMaxBitrateKbps: number;
  transcodeAudioBitrateKbps: number;
  transcodeMaxOutputHeight: number;
  transcodeRateControlBufferSeconds: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}
