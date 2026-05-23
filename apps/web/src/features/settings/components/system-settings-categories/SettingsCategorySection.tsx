import type { ReactNode } from 'react';

interface SettingsCategorySectionProps {
  id: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
}

export function SettingsCategorySection({
  id,
  kicker,
  title,
  description,
  badge,
  children,
}: SettingsCategorySectionProps) {
  return (
    <section id={id} className="settings-category is-open">
      <div className="settings-category-toggle settings-category-toggle-static">
        <div className="settings-category-toggle-copy">
          <p className="settings-section-kicker">{kicker}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>

        {badge ? (
          <div className="settings-category-toggle-meta">
            <span className="settings-pill">{badge}</span>
          </div>
        ) : null}
      </div>

      <div className="settings-category-content">
        {children}
      </div>
    </section>
  );
}
