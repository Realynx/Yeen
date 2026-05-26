export interface TvDisplayPreferences {
  largeText: boolean;
  highContrastFocus: boolean;
  reduceMotion: boolean;
}

export const TV_DISPLAY_PREFERENCES_KEY = 'yeen_tv_display_preferences_v1';

export const DEFAULT_TV_DISPLAY_PREFERENCES: TvDisplayPreferences = {
  largeText: false,
  highContrastFocus: false,
  reduceMotion: false,
};

export function readTvDisplayPreferences(): TvDisplayPreferences {
  try {
    const raw = window.localStorage.getItem(TV_DISPLAY_PREFERENCES_KEY);
    if (!raw) {
      return DEFAULT_TV_DISPLAY_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<TvDisplayPreferences>;
    return {
      largeText: parsed.largeText === true,
      highContrastFocus: parsed.highContrastFocus === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return DEFAULT_TV_DISPLAY_PREFERENCES;
  }
}

export function writeTvDisplayPreferences(preferences: TvDisplayPreferences): void {
  window.localStorage.setItem(TV_DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
  applyTvDisplayPreferences(preferences);
}

export function applyTvDisplayPreferences(preferences: TvDisplayPreferences): void {
  document.documentElement.dataset.yeenTvLargeText = preferences.largeText ? 'true' : 'false';
  document.documentElement.dataset.yeenTvHighContrastFocus = preferences.highContrastFocus ? 'true' : 'false';
  document.documentElement.dataset.yeenTvReduceMotion = preferences.reduceMotion ? 'true' : 'false';
}
