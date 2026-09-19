import { useState } from 'react';
import {
  readThemePreference,
  writeThemePreference,
  type ThemeId,
} from '../services/themePreference';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserAppearanceSectionProps {
  accountId: string;
  isOpen: boolean;
  onToggle: () => void;
}

interface ThemeOption {
  id: ThemeId;
  label: string;
  note: string;
  colors: readonly [string, string, string];
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'current',
    label: 'Yeen Current',
    note: 'Deep navy surfaces with warm coral and cool blue highlights.',
    colors: ['#080b12', '#ff8a4c', '#2fa3ff'],
  },
  {
    id: 'netflix',
    label: 'Cinematic Red',
    note: 'A Netflix-inspired black canvas with bold red actions and dramatic shelves.',
    colors: ['#070707', '#e50914', '#f5f5f1'],
  },
  {
    id: 'obsidian-purple',
    label: 'Obsidian Purple',
    note: 'Polished black panels, silver type, and electric purple accents.',
    colors: ['#050507', '#a6a8b3', '#9b5cff'],
  },
];

export function UserAppearanceSection({
  accountId,
  isOpen,
  onToggle,
}: UserAppearanceSectionProps) {
  const [themeId, setThemeId] = useState<ThemeId>(() => readThemePreference(accountId));
  const selectedTheme = THEME_OPTIONS.find((theme) => theme.id === themeId)
    ?? THEME_OPTIONS[0];

  function selectTheme(nextThemeId: ThemeId) {
    setThemeId(writeThemePreference(accountId, nextThemeId));
  }

  return (
    <UserSettingsCategorySection
      id="user-appearance"
      kicker="Appearance"
      title="Theme"
      description="Choose how Yeen looks on this browser. Your choice is kept separate for each account."
      badge={selectedTheme.label}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="theme-choice-grid" role="radiogroup" aria-label="Application theme">
        {THEME_OPTIONS.map((theme) => {
          const isSelected = theme.id === themeId;
          return (
            <button
              key={theme.id}
              type="button"
              className={isSelected ? 'theme-choice is-selected' : 'theme-choice'}
              role="radio"
              aria-checked={isSelected}
              onClick={() => selectTheme(theme.id)}
            >
              <span className="theme-choice-preview" aria-hidden="true">
                <span
                  className="theme-choice-preview-canvas"
                  style={{ backgroundColor: theme.colors[0] }}
                >
                  <span
                    className="theme-choice-preview-nav"
                    style={{ backgroundColor: theme.colors[1] }}
                  />
                  <span className="theme-choice-preview-row">
                    <span style={{ backgroundColor: theme.colors[2] }} />
                    <span style={{ backgroundColor: theme.colors[2] }} />
                    <span style={{ backgroundColor: theme.colors[2] }} />
                  </span>
                </span>
              </span>
              <span className="theme-choice-copy">
                <span className="theme-choice-title">{theme.label}</span>
                <span className="theme-choice-note">{theme.note}</span>
              </span>
              <span className="theme-choice-status" aria-hidden="true">
                {isSelected ? 'Selected' : 'Preview'}
              </span>
            </button>
          );
        })}
      </div>
    </UserSettingsCategorySection>
  );
}
