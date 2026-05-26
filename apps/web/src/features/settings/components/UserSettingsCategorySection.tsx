import { useRef, type ReactNode } from 'react';

interface UserSettingsCategorySectionProps {
  id: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function UserSettingsCategorySection({
  id,
  kicker,
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
}: UserSettingsCategorySectionProps) {
  const contentId = `${id}-content`;
  const sectionRef = useRef<HTMLElement | null>(null);

  function handleToggle() {
    const shouldFocusFirstField = !isOpen
      && document.documentElement.getAttribute('data-yeen-experience') === 'tv';
    onToggle();

    if (shouldFocusFirstField) {
      window.setTimeout(() => {
        sectionRef.current?.querySelector<HTMLElement>('.settings-category-content')?.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        )?.focus({ preventScroll: true });
      }, 0);
    }
  }

  return (
    <section ref={sectionRef} className={`settings-category${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="settings-category-toggle"
        data-tv-focus-key={`settings-category:${id}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="settings-category-toggle-copy">
          <p className="settings-section-kicker">{kicker}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>

        <div className="settings-category-toggle-meta">
          {badge ? <span className="settings-pill">{badge}</span> : null}
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
