import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { MediaLocationsState } from '../../pages/settings/useMediaLocations';
import type { SystemSettingsState } from '../../pages/settings/useSystemSettings';
import { MediaLocationsCategory } from './system-settings-tab/MediaLocationsCategory';
import { RuntimeCategory } from './system-settings-tab/RuntimeCategory';
import { SystemSettingsCategoriesForm } from './system-settings-tab/SystemSettingsCategoriesForm';

interface SystemSettingsTabProps {
  token: string;
  systemSettingsState: SystemSettingsState;
  mediaLocationsState: MediaLocationsState;
}

interface SystemSettingsNavItem {
  id: string;
  label: string;
  icon:
    | 'media'
    | 'runtime'
    | 'playback'
    | 'torrent'
    | 'metadata'
    | 'maintenance';
  note?: string;
}

function renderSystemSettingsNavIcon(icon: SystemSettingsNavItem['icon']) {
  switch (icon) {
    case 'media':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 7.5a2 2 0 0 1 2-2h5l1.8 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      );
    case 'runtime':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
    case 'playback':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5.5v13l11-6.5Z" />
        </svg>
      );
    case 'torrent':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M5 18.5h14" />
        </svg>
      );
    case 'maintenance':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.1M12 18.4v2.1M3.5 12h2.1M18.4 12h2.1M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" />
        </svg>
      );
    case 'metadata':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
          <path d="M9 9h6M9 12h6M9 15h4" />
        </svg>
      );
    default:
      return null;
  }
}

export function SystemSettingsTab({
  token,
  systemSettingsState,
  mediaLocationsState,
}: SystemSettingsTabProps) {
  const { locations, addLocation, scanConfiguredLocations } = mediaLocationsState;
  const { systemMessage, systemError, saveSystemSettings, clearMetadataIndex } =
    systemSettingsState;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveSystemSettings();
  }

  function handleAddLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addLocation();
  }

  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void scanConfiguredLocations();
  }

  function handleClearMetadata() {
    if (
      !window.confirm(
        'Clear all indexed media metadata? You can rebuild it by scanning your configured locations again.',
      )
    ) {
      return;
    }

    void clearMetadataIndex();
  }

  const configuredLabel =
    locations.length === 1 ? '1 location' : `${locations.length} locations`;

  const sectionNavItems = useMemo<SystemSettingsNavItem[]>(
    () => [
      {
        id: 'system-media-locations',
        label: 'Media Locations',
        icon: 'media',
        note: configuredLabel,
      },
      { id: 'system-runtime', label: 'Binaries & Storage', icon: 'runtime' },
      { id: 'system-playback', label: 'Playback Defaults', icon: 'playback' },
      { id: 'system-torrent', label: 'Torrent Providers', icon: 'torrent' },
      {
        id: 'system-metadata',
        label: 'Metadata Commits',
        icon: 'metadata',
        note: 'Backup & rollback',
      },
      { id: 'system-maintenance', label: 'Maintenance Tools', icon: 'maintenance' },
    ],
    [configuredLabel],
  );

  const [activeSectionId, setActiveSectionId] = useState(() => {
    const defaultSectionId = sectionNavItems[0]?.id ?? '';

    if (typeof window === 'undefined') {
      return defaultSectionId;
    }

    const hashSectionId = window.location.hash.replace('#', '');
    return sectionNavItems.some((item) => item.id === hashSectionId)
      ? hashSectionId
      : defaultSectionId;
  });

  useEffect(() => {
    const sectionElements = sectionNavItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);

    if (sectionElements.length === 0 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry) {
          setActiveSectionId(visibleEntry.target.id);
          return;
        }

        const closestSection = sectionElements
          .map((section) => ({
            id: section.id,
            distance: Math.abs(section.getBoundingClientRect().top - 120),
          }))
          .sort((left, right) => left.distance - right.distance)[0];

        if (closestSection) {
          setActiveSectionId(closestSection.id);
        }
      },
      {
        rootMargin: '-28% 0px -54% 0px',
        threshold: [0.1, 0.25, 0.45, 0.75],
      },
    );

    sectionElements.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
    };
  }, [sectionNavItems]);

  function scrollToSection(sectionId: string) {
    const section = document.getElementById(sectionId);

    if (!section) {
      return;
    }

    setActiveSectionId(sectionId);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const nextHash = `#${sectionId}`;
    if (window.location.hash !== nextHash) {
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }

  return (
    <section className="settings-content-grid">
      <article className="settings-surface settings-surface-full settings-surface-categorized">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Admin Controls</p>
            <h2>System Settings</h2>
          </div>
          <span className="settings-pill">Categorized Controls</span>
        </header>

        <p className="muted">
          Configure media libraries, runtime paths, playback defaults, and
          integration settings from grouped sections.
        </p>

        <p className="settings-inline-meta">
          Account and invite management is now available from the Accounts tab.
        </p>

        <div className="settings-categories system-settings-layout">
          <nav
            className="system-settings-nav"
            aria-label="System settings categories"
          >
            <p className="settings-section-kicker">Quick Jump</p>
            <ul className="system-settings-nav-list">
              {sectionNavItems.map((item) => {
                const isActive = activeSectionId === item.id;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`system-settings-nav-button${isActive ? ' is-active' : ''}`}
                      onClick={() => scrollToSection(item.id)}
                      aria-current={isActive ? 'location' : undefined}
                    >
                      <span className="system-settings-nav-button-main">
                        <span className="system-settings-nav-icon">
                          {renderSystemSettingsNavIcon(item.icon)}
                        </span>
                        <span className="system-settings-nav-copy">
                          <span className="system-settings-nav-label">{item.label}</span>
                          {item.note ? (
                            <span className="system-settings-nav-note">{item.note}</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="system-settings-sections">
            <div className="system-settings-media-runtime-categories">
              <MediaLocationsCategory
                mediaLocationsState={mediaLocationsState}
                configuredLabel={configuredLabel}
                onAddLocation={handleAddLocation}
                onScan={handleScan}
              />

              <RuntimeCategory runtimeSettingsState={systemSettingsState} />
            </div>

            <SystemSettingsCategoriesForm
              token={token}
              systemSettingsState={systemSettingsState}
              onSave={handleSave}
              onClearMetadata={handleClearMetadata}
            />

            {systemMessage ? <p className="scan-success">{systemMessage}</p> : null}
            {systemError ? <p className="error-text">{systemError}</p> : null}
          </div>
        </div>
      </article>
    </section>
  );
}
