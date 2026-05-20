export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  aiMetadataEnabled: boolean;
  aiProvider: 'ollama' | 'openai';
  aiModel: string;
  aiOllamaBaseUrl: string;
  aiOpenAiApiKey: string;
  aiDeduplicationEnabled: boolean;
  aiRequestTimeoutMs: number;
  tmdbApiKey: string;
  openSubtitlesApiKey: string;
  transcodePreset: string;
  transcodeCrf: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}
