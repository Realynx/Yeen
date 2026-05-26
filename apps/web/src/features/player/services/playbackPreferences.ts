export interface PlaybackPreferences {
  subtitlesEnabled: boolean;
  preferredSubtitleLanguage: string;
}

const PLAYBACK_PREFERENCES_KEY = 'yeen_playback_preferences_v1';

export const DEFAULT_PLAYBACK_PREFERENCES: PlaybackPreferences = {
  subtitlesEnabled: true,
  preferredSubtitleLanguage: '',
};

export function readPlaybackPreferences(): PlaybackPreferences {
  try {
    const raw = window.localStorage.getItem(PLAYBACK_PREFERENCES_KEY);
    if (!raw) {
      return DEFAULT_PLAYBACK_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<PlaybackPreferences>;
    return {
      subtitlesEnabled: parsed.subtitlesEnabled !== false,
      preferredSubtitleLanguage:
        typeof parsed.preferredSubtitleLanguage === 'string'
          ? parsed.preferredSubtitleLanguage.trim()
          : '',
    };
  } catch {
    return DEFAULT_PLAYBACK_PREFERENCES;
  }
}

export function writePlaybackPreferences(preferences: PlaybackPreferences): void {
  window.localStorage.setItem(PLAYBACK_PREFERENCES_KEY, JSON.stringify(preferences));
}
