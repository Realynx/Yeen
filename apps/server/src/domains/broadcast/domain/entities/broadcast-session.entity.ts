import type { BroadcastSubtitleFontPreset } from '@yeen/shared-contracts';

export interface BroadcastSession {
  ownerAccountId: string;
  shareToken: string;
  enabled: boolean;
  activePlayer: boolean;
  createdAt: string;
  updatedAt: string;
  mediaId: string | null;
  hlsSessionId: string | null;
  sourceEpoch: number;
  subtitleFileName: string | null;
  subtitleFontPreset: BroadcastSubtitleFontPreset | null;
  playbackPositionSeconds: number;
  playbackIsPlaying: boolean;
  playbackUpdatedAt: string | null;
  playbackSyncTimestampMs: number | null;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
}

export type {
  BroadcastSubtitleFontPreset,
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastStreamSegmentTrackingStatus,
  BroadcastViewerHeartbeatResponse,
} from '@yeen/shared-contracts';
