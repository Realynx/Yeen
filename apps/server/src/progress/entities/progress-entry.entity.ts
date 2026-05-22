export interface ProgressEntry {
  userId: string;
  mediaId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seriesPreferenceKey?: string | null;
  preferredAudioLanguage?: string | null;
  preferredSubtitleLanguage?: string | null;
  subtitlePreferenceEnabled?: boolean | null;
  updatedAt: string;
}
