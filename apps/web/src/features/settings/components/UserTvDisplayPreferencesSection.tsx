import { useEffect, useMemo, useState } from 'react';
import {
  readTvDisplayPreferences,
  writeTvDisplayPreferences,
  type TvDisplayPreferences,
} from '../../navigation/services/tvDisplayPreferences';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

const OPTIONS: Array<{
  key: keyof TvDisplayPreferences;
  label: string;
  note: string;
}> = [
  {
    key: 'largeText',
    label: 'Large TV Text',
    note: 'Bumps navigation, controls, and cards for 10-foot viewing.',
  },
  {
    key: 'highContrastFocus',
    label: 'High Contrast Focus',
    note: 'Adds a stronger amber focus ring for remotes.',
  },
  {
    key: 'reduceMotion',
    label: 'Reduce TV Motion',
    note: 'Softens hover scale, focus transitions, and ambient animation.',
  },
];

export function UserTvDisplayPreferencesSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [preferences, setPreferences] = useState<TvDisplayPreferences>(() =>
    readTvDisplayPreferences(),
  );

  useEffect(() => {
    writeTvDisplayPreferences(preferences);
  }, [preferences]);

  const enabledCount = useMemo(() => {
    return Object.values(preferences).filter(Boolean).length;
  }, [preferences]);

  return (
    <UserSettingsCategorySection
      id="user-tv-display"
      kicker="TV"
      title="TV Display Preferences"
      description="Tune readability, focus contrast, and motion for remote-first viewing."
      badge={enabledCount > 0 ? `${enabledCount} On` : 'Optional'}
      isOpen={isOpen}
      onToggle={() => setIsOpen((value) => !value)}
    >
      <div className="tv-display-preference-grid" role="group" aria-label="TV display preferences">
        {OPTIONS.map((option) => {
          const enabled = preferences[option.key];
          return (
            <button
              key={option.key}
              type="button"
              className={enabled ? 'tv-display-preference is-active' : 'tv-display-preference'}
              aria-pressed={enabled}
              onClick={() =>
                setPreferences((current) => ({
                  ...current,
                  [option.key]: !current[option.key],
                }))
              }
            >
              <span className="tv-display-preference-title">{option.label}</span>
              <span className="tv-display-preference-note">{option.note}</span>
            </button>
          );
        })}
      </div>
    </UserSettingsCategorySection>
  );
}
