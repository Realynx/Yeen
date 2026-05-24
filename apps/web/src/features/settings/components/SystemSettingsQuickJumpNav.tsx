import type { RefObject } from 'react';

export interface SystemSettingsNavItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon:
    | 'media'
    | 'runtime'
    | 'playback'
    | 'torrent'
    | 'metadata'
    | 'maintenance';
  note?: string;
}

interface SystemSettingsQuickJumpNavProps {
  sectionNavItems: SystemSettingsNavItem[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  additionalClassName?: string;
  compactLabels?: boolean;
  floatingListRef?: RefObject<HTMLUListElement | null>;
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

export function SystemSettingsQuickJumpNav({
  sectionNavItems,
  activeSectionId,
  onSelectSection,
  additionalClassName,
  compactLabels = false,
  floatingListRef,
}: SystemSettingsQuickJumpNavProps) {
  const navClassName = additionalClassName
    ? `system-settings-nav ${additionalClassName}`
    : 'system-settings-nav';

  return (
    <nav
      className={navClassName}
      aria-label="System settings categories"
    >
      <p className="settings-section-kicker">Quick Jump</p>
      <ul
        ref={compactLabels ? floatingListRef : undefined}
        className="system-settings-nav-list"
      >
        {sectionNavItems.map((item) => {
          const isActive = activeSectionId === item.id;
          const label = compactLabels ? item.shortLabel ?? item.label : item.label;
          const showNote = !compactLabels && Boolean(item.note);

          return (
            <li key={item.id}>
              <button
                type="button"
                className={`system-settings-nav-button${isActive ? ' is-active' : ''}`}
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'location' : undefined}
                data-section-id={item.id}
              >
                <span className="system-settings-nav-button-main">
                  <span className="system-settings-nav-icon">
                    {renderSystemSettingsNavIcon(item.icon)}
                  </span>
                  <span className="system-settings-nav-copy">
                    <span className="system-settings-nav-label">{label}</span>
                    {showNote ? (
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
  );
}
