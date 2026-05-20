import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProfileMenu } from '../components/ProfileMenu';
import { SettingsTabs } from '../components/settings/SettingsTabs';
import { SystemSettingsTab } from '../components/settings/SystemSettingsTab';
import { UserSettingsTab } from '../components/settings/UserSettingsTab';
import { getMediaStats } from '../lib/api';
import type { User } from '../lib/types';
import { useMediaLocations } from './settings/useMediaLocations';
import { useSystemSettings } from './settings/useSystemSettings';

interface SettingsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

type SettingsTab = 'user' | 'system';
type SettingsTheme = 'dark' | 'light';

const SETTINGS_THEME_STORAGE_KEY = 'yeen_settings_theme';

function getInitialSettingsTheme(): SettingsTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.localStorage.getItem(SETTINGS_THEME_STORAGE_KEY) === 'light'
    ? 'light'
    : 'dark';
}

export function SettingsPage({ token, user, onLogout }: SettingsPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user.role === 'admin';
  const [settingsTheme, setSettingsTheme] = useState<SettingsTheme>(() =>
    getInitialSettingsTheme(),
  );
  const [indexedItems, setIndexedItems] = useState<number | null>(null);
  const mediaLocations = useMediaLocations(token, isAdmin);
  const systemSettings = useSystemSettings(token, isAdmin);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_THEME_STORAGE_KEY, settingsTheme);
  }, [settingsTheme]);

  useEffect(() => {
    let cancelled = false;

    async function loadMediaStats() {
      try {
        const stats = await getMediaStats(token);
        if (!cancelled) {
          setIndexedItems(stats.indexedItems);
        }
      } catch {
        if (!cancelled) {
          setIndexedItems(null);
        }
      }
    }

    void loadMediaStats();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const activeTab = useMemo<SettingsTab>(() => {
    const requested = searchParams.get('tab');
    if (requested === 'system' && isAdmin) {
      return 'system';
    }

    return 'user';
  }, [isAdmin, searchParams]);

  function setTab(tab: SettingsTab) {
    if (tab === 'system') {
      setSearchParams({ tab: 'system' });
      return;
    }

    setSearchParams({});
  }

  function toggleTheme() {
    setSettingsTheme((previousTheme) =>
      previousTheme === 'dark' ? 'light' : 'dark',
    );
  }

  const mediaSourceLabel =
    !isAdmin
      ? 'Admin-only setting'
      : mediaLocations.locationsSource === 'settings'
        ? 'Saved in settings store'
        : mediaLocations.locationsSource === 'env'
          ? 'Using environment defaults'
          : 'Resolving source...';

  const settingsPageClassName =
    settingsTheme === 'light'
      ? 'settings-page settings-page-v2 settings-theme-light'
      : 'settings-page settings-page-v2';

  return (
    <main className={settingsPageClassName}>
      <section className="settings-hero-card">
        <header className="settings-hero-main settings-header">
          <div className="settings-hero-copy">
            <p className="eyebrow">Yeen Control Room</p>
            <h1>Settings</h1>
            <p className="muted">
              Shape your library workflow and playback defaults from one polished
              workspace.
            </p>
          </div>

          <div className="settings-hero-actions settings-header-actions">
            <button
              className="ghost-button theme-toggle-button"
              type="button"
              onClick={toggleTheme}
              aria-pressed={settingsTheme === 'light'}
              aria-label={`Switch to ${settingsTheme === 'light' ? 'dark' : 'light'} theme`}
            >
              <span className="theme-toggle-icon" aria-hidden="true">
                {settingsTheme === 'light' ? (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path
                      d="M20.8 15.5a8.8 8.8 0 0 1-12.3-12.2A9 9 0 1 0 20.8 15.5z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path
                      d="M12 4.3a.8.8 0 0 1 .8.8v1.6a.8.8 0 0 1-1.6 0V5.1a.8.8 0 0 1 .8-.8zm0 12.6a.8.8 0 0 1 .8.8v1.6a.8.8 0 0 1-1.6 0v-1.6a.8.8 0 0 1 .8-.8zm7-5.7a.8.8 0 0 1 0 1.6h-1.6a.8.8 0 0 1 0-1.6H19zm-12.4 0a.8.8 0 0 1 0 1.6H5a.8.8 0 0 1 0-1.6h1.6zm9.3-4.5a.8.8 0 0 1 1.1 0l1.2 1.1a.8.8 0 1 1-1.1 1.2L16 7.8a.8.8 0 0 1 0-1.1zm-9 9a.8.8 0 0 1 1.2 0L9.1 17a.8.8 0 0 1-1.2 1.1l-1.1-1.2a.8.8 0 0 1 0-1.1zm11.3 1.3a.8.8 0 0 1 0 1.1L17 19.2a.8.8 0 0 1-1.1-1.1l1.1-1.1a.8.8 0 0 1 1.2 0zm-9-9a.8.8 0 0 1 0 1.1L8 10.2A.8.8 0 0 1 6.8 9l1.1-1.1a.8.8 0 0 1 1.1 0zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </span>
              <span>{settingsTheme === 'light' ? 'Dark Theme' : 'Light Theme'}</span>
            </button>

            <button
              className="ghost-button"
              type="button"
              onClick={() => navigate('/')}
            >
              Back To Home
            </button>
            <ProfileMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        <section className="settings-hero-stats" aria-label="Settings overview">
          <article className="settings-hero-stat">
            <div className="settings-hero-stat-top">
              <span className="settings-hero-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <path
                    d="M4.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13zm2 .4v3.8h11V5.9h-11zm0 5.6v6.6h11v-6.6h-11z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="settings-hero-stat-label">Current Tab</span>
            </div>
            <strong className="settings-hero-stat-value">
              {activeTab === 'user' ? 'User Settings' : 'System Settings'}
            </strong>
            <span className="settings-hero-stat-note">Focused workspace</span>
          </article>

          <article className="settings-hero-stat">
            <div className="settings-hero-stat-top">
              <span className="settings-hero-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <path
                    d="M6.3 4.8A2.8 2.8 0 0 0 3.5 7.6v8.8a2.8 2.8 0 0 0 2.8 2.8h11.4a2.8 2.8 0 0 0 2.8-2.8V9.2a2.8 2.8 0 0 0-2.8-2.8h-6.1l-1-1.2a1.8 1.8 0 0 0-1.4-.6H6.3z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="settings-hero-stat-label">Media Locations</span>
            </div>
            <strong className="settings-hero-stat-value">
              {isAdmin ? mediaLocations.locations.length : 'Restricted'}
            </strong>
            <span className="settings-hero-stat-note">{mediaSourceLabel}</span>
          </article>

          <article className="settings-hero-stat">
            <div className="settings-hero-stat-top">
              <span className="settings-hero-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation">
                  <path
                    d="M7 4v16M17 4v16M4 8h6M14 14h6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="settings-hero-stat-label">Indexed Media</span>
            </div>
            <strong className="settings-hero-stat-value">
              {indexedItems === null ? '--' : indexedItems.toLocaleString()}
            </strong>
            <span className="settings-hero-stat-note">
              Media items currently stored in the metadata index
            </span>
          </article>
        </section>
      </section>

      <section className="settings-shell">
        <aside className="settings-sidebar" aria-label="Settings navigation">
          <SettingsTabs
            activeTab={activeTab}
            showSystemTab={isAdmin}
            onChange={setTab}
          />

          <article className="settings-sidebar-note">
            <h2>{activeTab === 'user' ? 'User Workspace' : 'Admin Workspace'}</h2>
            <p>
              {activeTab === 'user'
                ? 'Manage your profile information and review your account access scope.'
                : 'Tune media locations, subtitle defaults, transcode quality, and system binaries.'}
            </p>
          </article>
        </aside>

        <section className="settings-content-panel">
          {activeTab === 'user' ? (
            <UserSettingsTab user={user} />
          ) : (
            <SystemSettingsTab
              systemSettingsState={systemSettings}
              mediaLocationsState={mediaLocations}
              token={token}
            />
          )}
        </section>
      </section>
    </main>
  );
}
