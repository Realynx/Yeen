export interface MediaScanProgress {
  scanId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  phase: "idle" | "collecting" | "probing" | "saving" | "completed" | "failed";
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

export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  tmdbApiKey: string;
  openSubtitlesApiKey: string;
  theAudioDbEnabled: boolean;
  theAudioDbChartCountry: string;
  theAudioDbHasCustomApiKey: boolean;
  /** Write-only. Omitted responses preserve the currently stored key. */
  theAudioDbCustomApiKey?: string;
  /** Write-only. A saved key is removed only when this is explicitly true. */
  clearTheAudioDbCustomApiKey?: boolean;
  transcodeHardwareAcceleration: "auto" | "nvidia" | "cpu";
  transcodePreset: string;
  transcodeCrf: number;
  transcodeDefaultMaxBitrateKbps: number;
  transcodeAudioBitrateKbps: number;
  transcodeMaxOutputHeight: number;
  transcodeRateControlBufferSeconds: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}
