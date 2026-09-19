import type { User } from '../../shared/services/types';
import {
  formatMemberSince,
  initialForName,
} from './userSettingsViewUtils';
import {
  USER_SETTINGS_SECTION_IDS,
  type UserSettingsCategoryId,
  type UserSettingsQuickAction,
} from './userSettings.types';

interface UserSettingsOverviewSidebarProps {
  user: User;
  avatarPreviewUrl: string | null;
  roleLabel: string;
  configScopeLabel: string;
  remainingInvitesLabel: string;
  maxBitrateLabel: string;
  expandedCategories: Record<UserSettingsCategoryId, boolean>;
  quickActions: UserSettingsQuickAction[];
  onOpenCategory: (category: UserSettingsCategoryId) => void;
}

export function UserSettingsOverviewSidebar({
  user,
  avatarPreviewUrl,
  roleLabel,
  configScopeLabel,
  remainingInvitesLabel,
  maxBitrateLabel,
  expandedCategories,
  quickActions,
  onOpenCategory,
}: UserSettingsOverviewSidebarProps) {
  return (
    <aside
      className="user-settings-layout-sidebar"
      aria-label="Profile quick summary"
      data-tv-focus-lane-id="user-settings-overview"
    >
      <section className="user-settings-overview-card user-settings-overview-left-column" aria-label="Profile summary">
        <div className="user-settings-avatar-preview-shell user-settings-avatar-preview-shell-large">
          {avatarPreviewUrl ? (
            <img
              src={avatarPreviewUrl}
              alt={`${user.name} profile`}
              className="user-settings-avatar-preview"
            />
          ) : (
            <span className="profile-avatar user-settings-avatar-fallback user-settings-avatar-fallback-large">
              {initialForName(user.name)}
            </span>
          )}
        </div>

        <div className="user-settings-overview-details">
          <p className="settings-section-kicker">Profile Snapshot</p>
          <h3>{user.name}</h3>
          <p className="muted">{user.email}</p>

          <dl className="settings-profile-list user-settings-profile-summary user-settings-profile-summary-overview">
            <div>
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div>
              <dt>Member Since</dt>
              <dd>{formatMemberSince(user.createdAt)}</dd>
            </div>
            <div>
              <dt>Config Scope</dt>
              <dd>{configScopeLabel}</dd>
            </div>
            <div>
              <dt>Invites</dt>
              <dd>{remainingInvitesLabel}</dd>
            </div>
            <div>
              <dt>Max Bitrate</dt>
              <dd>{maxBitrateLabel}</dd>
            </div>
          </dl>
        </div>
      </section>

      <nav
        className="system-settings-nav user-settings-quick-actions"
        aria-label="Profile quick actions"
        data-tv-focus-lane-id="user-settings-quick-actions"
      >
        <p className="settings-section-kicker">Quick Actions</p>

        <ul className="system-settings-nav-list user-settings-quick-actions-list">
          {quickActions.map((item) => {
            const isActive = expandedCategories[item.category];

            return (
              <li key={item.category}>
                <button
                  type="button"
                  className={`system-settings-nav-button${isActive ? ' is-active' : ''}`}
                  onClick={() => onOpenCategory(item.category)}
                  aria-expanded={isActive}
                  aria-controls={`${USER_SETTINGS_SECTION_IDS[item.category]}-content`}
                >
                  <span className="system-settings-nav-button-main">
                    <span className="user-settings-quick-action-dot" aria-hidden="true" />
                    <span className="system-settings-nav-copy">
                      <span className="system-settings-nav-label">{item.label}</span>
                      <span className="system-settings-nav-note">{item.note}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
