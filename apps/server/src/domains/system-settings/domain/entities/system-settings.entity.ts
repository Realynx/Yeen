export interface QbittorrentPathMapping {
  from: string;
  to: string;
}

export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  qbittorrentBaseUrl: string;
  qbittorrentUsername: string;
  qbittorrentPassword: string;
  qbittorrentRequestTimeoutMs: number;
  qbittorrentDefaultOrderMode: 'sequential' | 'random';
  /**
   * Optional list of prefix rewrites applied to paths reported by qBittorrent
   * (save_path / content_path). Useful when qBittorrent runs in a container
   * with different mount points than the host where Yeen runs. The longest
   * matching `from` prefix wins.
   */
  qbittorrentPathMappings: QbittorrentPathMapping[];
  iptorrentsUsername: string;
  iptorrentsPassword: string;
  iptorrentsSeedingEnabled: boolean;
  nyaaSeedingEnabled: boolean;
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
  transcodeDefaultMaxBitrateKbps: number;
  transcodeAudioBitrateKbps: number;
  transcodeMaxOutputHeight: number;
  transcodeRateControlBufferSeconds: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}
