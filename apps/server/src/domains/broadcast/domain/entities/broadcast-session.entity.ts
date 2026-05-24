export interface BroadcastSession {
  ownerAccountId: string;
  shareToken: string;
  enabled: boolean;
  activePlayer: boolean;
  createdAt: string;
  updatedAt: string;
  mediaId: string | null;
  hlsSessionId: string | null;
  subtitleFileName: string | null;
  playbackPositionSeconds: number;
  playbackIsPlaying: boolean;
  playbackUpdatedAt: string | null;
  playbackSyncTimestampMs: number | null;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
}

export interface BroadcastOwnerSessionStatus {
  enabled: boolean;
  activePlayer: boolean;
  shareToken: string | null;
  mediaId: string | null;
  hlsSessionId: string | null;
  subtitleFileName: string | null;
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

export interface BroadcastPublicSessionStatus {
  enabled: boolean;
  isLive: boolean;
  activePlayer: boolean;
  shareToken: string;
  mediaId: string | null;
  manifestUrl: string | null;
  subtitleUrl: string | null;
  playbackPositionSeconds: number;
  playbackIsPlaying: boolean;
  playbackUpdatedAt: string | null;
  viewerCount: number;
}

export interface BroadcastViewerHeartbeatResponse {
  viewerId: string;
  viewerCount: number;
  enabled: boolean;
  isLive: boolean;
}
