export interface ProgressEntry {
  accountId: string;
  userId?: string;
  mediaId: string;
  positionSeconds: number;
  durationSeconds: number;
  syncTimestampMs?: number | null;
  completed: boolean;
  seriesPreferenceKey?: string | null;
  preferredAudioLanguage?: string | null;
  preferredSubtitleLanguage?: string | null;
  subtitlePreferenceEnabled?: boolean | null;
  updatedAt: string;
}
