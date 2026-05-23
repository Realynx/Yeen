import type { User } from '../../shared/services/types';
import { AdminNav } from '../../navigation/components/AdminNav';
import { UserSettingsTab } from '../components/UserSettingsTab';

interface SettingsPageProps {
  token: string;
  user: User;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}

export function SettingsPage({ token, user, onUserUpdated, onLogout }: SettingsPageProps) {
  return (
    <main className="browse-page admin-page settings-page-v2">
      <AdminNav user={user} onLogout={onLogout} />

      <section className="admin-page-header admin-page-header-compact">
        <p className="eyebrow">Account</p>
        <h1>Profile</h1>
        <p className="muted">
          Manage your account details. System-wide library locations and
          runtime configuration live in the admin sections above.
        </p>
      </section>

      <UserSettingsTab token={token} user={user} onUserUpdated={onUserUpdated} />
    </main>
  );
}
