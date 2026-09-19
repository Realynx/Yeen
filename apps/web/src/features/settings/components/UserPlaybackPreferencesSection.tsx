import { useState } from 'react';
import {
  readPlaybackPreferences,
  writePlaybackPreferences,
  type PlaybackPreferences,
} from '../../player/services/playbackPreferences';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserPlaybackPreferencesSectionProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function UserPlaybackPreferencesSection({
  isOpen,
  onToggle,
}: UserPlaybackPreferencesSectionProps) {
  const [preferences, setPreferences] = useState<PlaybackPreferences>(() =>
    readPlaybackPreferences(),
  );

  function updatePreferences(nextPreferences: PlaybackPreferences) {
    setPreferences(nextPreferences);
    writePlaybackPreferences(nextPreferences);
  }

  const preferredLanguage = preferences.preferredSubtitleLanguage.trim();

  return (
    <UserSettingsCategorySection
      id="user-playback-preferences"
      kicker="Playback"
      title="Subtitle Defaults"
      description="Choose whether playback starts with subtitles and which language to prefer."
      badge={preferences.subtitlesEnabled ? 'Auto' : 'Off'}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="tv-display-preference-grid" role="group" aria-label="Subtitle defaults">
        <button
          type="button"
          className={preferences.subtitlesEnabled ? 'tv-display-preference is-active' : 'tv-display-preference'}
          aria-pressed={preferences.subtitlesEnabled}
          onClick={() => updatePreferences({ ...preferences, subtitlesEnabled: true })}
        >
          <span className="tv-display-preference-title">Auto-select subtitles</span>
          <span className="tv-display-preference-note">Start with your preferred language, then the first available track.</span>
        </button>
        <button
          type="button"
          className={!preferences.subtitlesEnabled ? 'tv-display-preference is-active' : 'tv-display-preference'}
          aria-pressed={!preferences.subtitlesEnabled}
          onClick={() => updatePreferences({ ...preferences, subtitlesEnabled: false })}
        >
          <span className="tv-display-preference-title">Start subtitles off</span>
          <span className="tv-display-preference-note">Keep captions disabled until you pick one in the player.</span>
        </button>
      </div>

      <label className="settings-field settings-field-wide" htmlFor="preferred-subtitle-language">
        <span className="settings-field-label">Preferred Subtitle Language</span>
        <input
          id="preferred-subtitle-language"
          value={preferences.preferredSubtitleLanguage}
          placeholder="eng, en, ja, spa..."
          onChange={(event) =>
            updatePreferences({
              ...preferences,
              preferredSubtitleLanguage: event.target.value,
            })
          }
        />
        <small className="settings-field-hint">
          {preferredLanguage
            ? `Yeen will try "${preferredLanguage}" before falling back.`
            : 'Leave blank to use the first available subtitle track.'}
        </small>
      </label>
    </UserSettingsCategorySection>
  );
}
