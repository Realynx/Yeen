import type { User } from '../../lib/types';

interface UserSettingsTabProps {
  user: User;
}

function formatMemberSince(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(parsed));
}

export function UserSettingsTab({ user }: UserSettingsTabProps) {
  const roleLabel = user.role === 'admin' ? 'Administrator' : 'Standard User';

  return (
    <section className="settings-content-grid">
      <article className="settings-surface settings-surface-full">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Account</p>
            <h2>Profile</h2>
          </div>
          <span className="settings-pill">{roleLabel}</span>
        </header>

        <p className="muted">
          Manage your account details. System-wide library locations and runtime
          configuration are available in the System Settings tab for administrators.
        </p>

        <dl className="settings-profile-list">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
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
            <dd>{user.role === 'admin' ? 'User + System' : 'User only'}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
