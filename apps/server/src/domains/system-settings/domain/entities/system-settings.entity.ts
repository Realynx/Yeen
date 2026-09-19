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
  theAudioDbEnabled: boolean;
  theAudioDbCustomApiKey: string;
  theAudioDbChartCountry: string;
  transcodeHardwareAcceleration: 'auto' | 'nvidia' | 'cpu';
  transcodePreset: string;
  transcodeCrf: number;
  transcodeDefaultMaxBitrateKbps: number;
  transcodeAudioBitrateKbps: number;
  transcodeMaxOutputHeight: number;
  transcodeRateControlBufferSeconds: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}

export type PublicSystemSettings = Omit<
  SystemSettings,
  'theAudioDbCustomApiKey'
> & {
  theAudioDbHasCustomApiKey: boolean;
};
