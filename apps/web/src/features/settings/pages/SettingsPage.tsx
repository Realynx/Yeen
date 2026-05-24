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

      <UserSettingsTab token={token} user={user} onUserUpdated={onUserUpdated} />
    </main>
  );
}
