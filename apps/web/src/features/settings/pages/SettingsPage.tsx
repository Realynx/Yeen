import type { User } from '../../shared/services/types';
import { AdminNav } from '../../navigation/components/AdminNav';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import { SettingsAppShell } from '../components/SettingsAppShell';
import { UserSettingsTab } from '../components/UserSettingsTab';

export interface SettingsPageProps {
  token: string;
  user: User;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
  experience?: ClientExperience;
}

export function SettingsPage({
  token,
  user,
  onUserUpdated,
  onLogout,
  experience = 'desktop',
}: SettingsPageProps) {
  return (
    <main className="browse-page admin-page settings-page-v2">
      <AdminNav user={user} onLogout={onLogout} />

      <SettingsAppShell
        user={user}
        experience={experience}
        title="Profile & preferences"
        description="Manage your identity, playback defaults, security, and connected devices."
      >
        <UserSettingsTab token={token} user={user} onUserUpdated={onUserUpdated} />
      </SettingsAppShell>
    </main>
  );
}
