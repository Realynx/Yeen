type SettingsTab = 'user' | 'system';

interface SettingsTabsProps {
  activeTab: SettingsTab;
  showSystemTab: boolean;
  onChange: (tab: SettingsTab) => void;
}

function tabClass(active: boolean) {
  return active ? 'settings-tab-pill active' : 'settings-tab-pill';
}

export function SettingsTabs({
  activeTab,
  showSystemTab,
  onChange,
}: SettingsTabsProps) {
  return (
    <section className="settings-tab-rail" aria-label="Settings tabs">
      <button
        type="button"
        className={tabClass(activeTab === 'user')}
        onClick={() => onChange('user')}
      >
        <span className="settings-tab-head">
          <span className="settings-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation">
              <path
                d="M12 4.1A4.4 4.4 0 1 1 7.6 8.5 4.4 4.4 0 0 1 12 4.1zm0 10.5c4 0 7.3 2.1 7.3 4.8 0 .5-.4.9-.9.9H5.6a.9.9 0 0 1-.9-.9c0-2.7 3.3-4.8 7.3-4.8z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="settings-tab-title">User Settings</span>
        </span>
        <span className="settings-tab-subtitle">
          Profile and personal access information
        </span>
      </button>

      {showSystemTab ? (
        <button
          type="button"
          className={tabClass(activeTab === 'system')}
          onClick={() => onChange('system')}
        >
          <span className="settings-tab-head">
            <span className="settings-tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path
                  d="M10 4.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm9 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm-9 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm9 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM7.5 7v10m9-10v10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="settings-tab-title">System Settings</span>
          </span>
          <span className="settings-tab-subtitle">
            Library locations and runtime configuration
          </span>
        </button>
      ) : null}
    </section>
  );
}
