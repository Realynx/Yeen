import type { ReactNode } from 'react';

interface SettingsCategorySectionProps {
  id: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function SettingsCategorySection({
  id,
  kicker,
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
}: SettingsCategorySectionProps) {
  const contentId = `${id}-content`;

  return (
    <section id={id} className={`settings-category${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="settings-category-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="settings-category-toggle-copy">
          <p className="settings-section-kicker">{kicker}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>

        <div className="settings-category-toggle-meta">
          {badge ? (
            <span className="settings-pill">{badge}</span>
          ) : null}
          <span
            className={`settings-category-chevron${isOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          >
            v
          </span>
        </div>
      </button>

      {isOpen ? (
        <div id={contentId} className="settings-category-content">
          {children}
        </div>
      ) : null}
    </section>
  );
}
