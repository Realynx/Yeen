import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { MediaLocationsState } from '../services/useMediaLocations';
import type { SystemSettingsState } from '../services/useSystemSettings';
import { MediaLocationsCategory } from './system-settings-categories/MediaLocationsCategory';
import { RuntimeCategory } from './system-settings-categories/RuntimeCategory';
import { SystemSettingsCategoriesForm } from './system-settings-categories/SystemSettingsCategoriesForm';
import { SystemSettingsQuickJumpNav } from './SystemSettingsQuickJumpNav';
import {
  SYSTEM_SETTINGS_SECTION_IDS,
  createCollapsedSectionsState,
  createSystemSettingsNavEntries,
  type SystemSettingsNavEntry,
  type SystemSettingsSectionId,
} from './systemSettingsNavItems';

interface SystemSettingsTabProps {
  token: string;
  systemSettingsState: SystemSettingsState;
  mediaLocationsState: MediaLocationsState;
  phoneFloatingQuickJumpBar?: boolean;
}

export function SystemSettingsTab({
  token,
  systemSettingsState,
  mediaLocationsState,
  phoneFloatingQuickJumpBar = false,
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

  const sectionNavItems = useMemo<SystemSettingsNavEntry[]>(
    () => createSystemSettingsNavEntries(configuredLabel),
    [configuredLabel],
  );

  const floatingQuickJumpListRef = useRef<HTMLUListElement | null>(null);

  const [activeSectionId, setActiveSectionId] = useState(() => {
    const defaultSectionId =
      sectionNavItems[0]?.id ?? SYSTEM_SETTINGS_SECTION_IDS[0];

    if (typeof window === 'undefined') {
      return defaultSectionId;
    }

    const hashSectionId = window.location.hash.replace('#', '');
    return sectionNavItems.some((item) => item.id === hashSectionId)
      ? (hashSectionId as SystemSettingsSectionId)
      : defaultSectionId;
  });

  const [expandedSections, setExpandedSections] = useState<
    Record<SystemSettingsSectionId, boolean>
  >(() => {
    if (typeof window === 'undefined') {
      return createCollapsedSectionsState();
    }

    const hashSectionId = window.location.hash.replace('#', '');
    const defaultOpenSectionId = sectionNavItems.find(
      (item) => item.id === hashSectionId,
    )?.id;

    return createCollapsedSectionsState(defaultOpenSectionId);
  });

  const toggleSection = useCallback((sectionId: SystemSettingsSectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
    setActiveSectionId(sectionId);
  }, []);

  const expandSection = useCallback((sectionId: SystemSettingsSectionId) => {
    setExpandedSections((current) => {
      if (current[sectionId]) {
        return current;
      }

      return {
        ...current,
        [sectionId]: true,
      };
    });
  }, []);

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
          setActiveSectionId(visibleEntry.target.id as SystemSettingsSectionId);
          return;
        }

        const closestSection = sectionElements
          .map((section) => ({
            id: section.id,
            distance: Math.abs(section.getBoundingClientRect().top - 120),
          }))
          .sort((left, right) => left.distance - right.distance)[0];

        if (closestSection) {
          setActiveSectionId(closestSection.id as SystemSettingsSectionId);
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

  function scrollToSection(sectionId: SystemSettingsSectionId) {
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

  const scrollFloatingQuickJumpToSection = useCallback((
    sectionId: SystemSettingsSectionId,
    options: {
      behavior: ScrollBehavior;
      center: boolean;
    },
  ) => {
    if (!phoneFloatingQuickJumpBar) {
      return;
    }

    const list = floatingQuickJumpListRef.current;
    if (!list) {
      return;
    }

    const button = list.querySelector<HTMLButtonElement>(
      `.system-settings-nav-button[data-section-id="${sectionId}"]`,
    );

    if (!button) {
      return;
    }

    const listWidth = list.clientWidth;
    const listStart = list.scrollLeft;
    const listEnd = listStart + listWidth;
    const buttonStart = button.offsetLeft;
    const buttonEnd = buttonStart + button.offsetWidth;
    const edgePadding = 12;

    let targetLeft: number | null = null;

    if (options.center) {
      targetLeft = buttonStart - (listWidth - button.offsetWidth) / 2;
    } else if (buttonStart < listStart + edgePadding) {
      targetLeft = buttonStart - edgePadding;
    } else if (buttonEnd > listEnd - edgePadding) {
      targetLeft = buttonEnd - listWidth + edgePadding;
    }

    if (targetLeft === null) {
      return;
    }

    const maxLeft = Math.max(0, list.scrollWidth - listWidth);
    const nextLeft = Math.min(maxLeft, Math.max(0, targetLeft));

    list.scrollTo({
      left: nextLeft,
      behavior: options.behavior,
    });
  }, [phoneFloatingQuickJumpBar]);

  useEffect(() => {
    if (!phoneFloatingQuickJumpBar) {
      return;
    }

    scrollFloatingQuickJumpToSection(activeSectionId, {
      behavior: 'auto',
      center: false,
    });
  }, [
    activeSectionId,
    phoneFloatingQuickJumpBar,
    scrollFloatingQuickJumpToSection,
  ]);

  const handleQuickJumpSelect = useCallback((
    sectionId: string,
    options: {
      fromFloating: boolean;
    },
  ) => {
    const typedSectionId = sectionId as SystemSettingsSectionId;
    expandSection(typedSectionId);
    scrollToSection(typedSectionId);

    if (options.fromFloating) {
      scrollFloatingQuickJumpToSection(typedSectionId, {
        behavior: 'smooth',
        center: true,
      });
    }
  }, [expandSection, scrollFloatingQuickJumpToSection]);

  const contentGridClassName = phoneFloatingQuickJumpBar
    ? 'settings-content-grid settings-content-grid-phone-float-nav'
    : 'settings-content-grid';

  const categoriesClassName = phoneFloatingQuickJumpBar
    ? 'settings-categories system-settings-layout system-settings-layout-phone-floating'
    : 'settings-categories system-settings-layout';

  return (
    <section className={contentGridClassName}>
      {phoneFloatingQuickJumpBar
        ? (
          <SystemSettingsQuickJumpNav
            sectionNavItems={sectionNavItems}
            activeSectionId={activeSectionId}
            onSelectSection={(sectionId) => {
              handleQuickJumpSelect(sectionId, { fromFloating: true });
            }}
            additionalClassName="system-settings-nav-floating-bar"
            compactLabels
            floatingListRef={floatingQuickJumpListRef}
          />
        )
        : null}

      <article className="settings-surface settings-surface-full settings-surface-categorized">
        <header className="settings-surface-header system-settings-title-panel">
          <div className="system-settings-title-copy">
            <p className="settings-section-kicker">Admin Controls</p>
            <h2>System Settings</h2>
          </div>
          <span className="settings-pill system-settings-title-pill">Categorized Controls</span>
        </header>

        <div className={categoriesClassName}>
          {phoneFloatingQuickJumpBar
            ? null
            : (
              <SystemSettingsQuickJumpNav
                sectionNavItems={sectionNavItems}
                activeSectionId={activeSectionId}
                onSelectSection={(sectionId) => {
                  handleQuickJumpSelect(sectionId, { fromFloating: false });
                }}
              />
            )}

          <div className="system-settings-sections">
            <div className="system-settings-media-runtime-categories">
              <MediaLocationsCategory
                mediaLocationsState={mediaLocationsState}
                configuredLabel={configuredLabel}
                isOpen={expandedSections['system-media-locations']}
                onToggle={() => toggleSection('system-media-locations')}
                onAddLocation={handleAddLocation}
                onScan={handleScan}
              />

              <RuntimeCategory
                runtimeSettingsState={systemSettingsState}
                isOpen={expandedSections['system-runtime']}
                onToggle={() => toggleSection('system-runtime')}
              />
            </div>

            <SystemSettingsCategoriesForm
              token={token}
              systemSettingsState={systemSettingsState}
              onSave={handleSave}
              onClearMetadata={handleClearMetadata}
              playbackIsOpen={expandedSections['system-transcoding']}
              onTogglePlayback={() => toggleSection('system-transcoding')}
              metadataDefaultsIsOpen={expandedSections['system-metadata-defaults']}
              onToggleMetadataDefaults={() =>
                toggleSection('system-metadata-defaults')
              }
              torrentClientIsOpen={expandedSections['system-torrent-client']}
              onToggleTorrentClient={() => toggleSection('system-torrent-client')}
              torrentProvidersIsOpen={expandedSections['system-torrent-trackers']}
              onToggleTorrentProviders={() =>
                toggleSection('system-torrent-trackers')
              }
              metadataCommitsIsOpen={expandedSections['system-metadata-commits']}
              onToggleMetadataCommits={() =>
                toggleSection('system-metadata-commits')
              }
              maintenanceIsOpen={expandedSections['system-maintenance']}
              onToggleMaintenance={() => toggleSection('system-maintenance')}
            />

            {systemMessage ? <p className="scan-success">{systemMessage}</p> : null}
            {systemError ? <p className="error-text">{systemError}</p> : null}
          </div>
        </div>
      </article>
    </section>
  );
}
