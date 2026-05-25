export interface BroadcastOwnerSessionStatus {
  enabled: boolean;
  activePlayer: boolean;
  shareToken: string | null;
  mediaId: string | null;
  hlsSessionId: string | null;
  subtitleFileName: string | null;
  subtitleFontPreset: BroadcastSubtitleFontPreset | null;
  playbackPositionSeconds: number;
  playbackIsPlaying: boolean;
  playbackUpdatedAt: string | null;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
  viewerCount: number;
  updatedAt: string | null;
}

export type BroadcastSubtitleFontPreset =
  | 'clear'
  | 'rounded'
  | 'mono'
  | 'condensed';

export interface BroadcastStreamSegmentTrackingStatus {
  segmentSeconds: number | null;
  playbackSegmentIndex: number | null;
  readySegmentIndex: number | null;
  readyThroughSeconds: number | null;
  contiguousReadySegments: number | null;
  highestReadySegment: number | null;
  nextSegmentIndex: number | null;
}

export interface BroadcastPublicSessionStatus {
  enabled: boolean;
  isLive: boolean;
  activePlayer: boolean;
  shareToken: string;
  mediaId: string | null;
  sourceEpoch: number;
  streamKey: string | null;
  manifestUrl: string | null;
  subtitleUrl: string | null;
  subtitleFontPreset: BroadcastSubtitleFontPreset | null;
  playbackPositionSeconds: number;
  playbackIsPlaying: boolean;
  playbackUpdatedAt: string | null;
  playbackUpdatedAtMs: number | null;
  serverNowMs: number;
  segmentTracking: BroadcastStreamSegmentTrackingStatus | null;
  viewerCount: number;
}

export interface BroadcastViewerHeartbeatResponse {
  viewerId: string;
  viewerCount: number;
  enabled: boolean;
  isLive: boolean;
}

export interface BroadcastEnabledUpdate {
  enabled: boolean;
}

export interface BroadcastSourceUpdate {
  mediaId?: string | null;
  hlsSessionId?: string | null;
  subtitleFileName?: string | null;
  subtitleFontPreset?: BroadcastSubtitleFontPreset | null;
  selectedAudioStreamIndex?: number | null;
  maxVideoBitrateKbps?: number | null;
  audioBitrateKbps?: number | null;
  maxOutputHeight?: number | null;
}

export interface BroadcastPlaybackUpdate {
  positionSeconds: number;
  playbackIsPlaying: boolean;
  activePlayer?: boolean;
  syncTimestampMs?: number;
}

export interface BroadcastViewerHeartbeatUpdate {
  viewerId?: string;
}
