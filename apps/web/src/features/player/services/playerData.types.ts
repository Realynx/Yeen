import type {
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
} from '../../shared/services/types';

export interface SeriesPlaybackPreference {
  key: string;
  preferredAudioLanguage: string | null;
  preferredSubtitleLanguage: string | null;
  subtitlePreferenceEnabled: boolean | null;
}

export interface PlaybackSource {
  url: string;
  hls: boolean;
  hlsSessionId: string | null;
  audioStreamIndex: number | null;
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
}

export interface PlayerTranscodePreferences {
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
}

export interface PlayerDataState {
  media: MediaItem | null;
  source: PlaybackSource | null;
  streamTorrentHash: string | null;
  audioTracks: PlaybackAudioTrack[];
  selectedAudioStreamIndex: number | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string;
  selectedSubtitle: SubtitleTrack | null;
  resumeAtSeconds: number;
  loading: boolean;
  error: string | null;
  switchingToHls: boolean;
  extractingSubtitleTrackId: string | null;
  setSelectedAudioStreamIndex: (audioStreamIndex: number | null) => void;
  setSelectedSubtitleId: (subtitleId: string) => void;
  extractTrack: (track: SubtitleTrack) => Promise<void>;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => Promise<boolean>;
}
