import { Navigate } from 'react-router-dom';
import { AdminNav } from '../../navigation/components/AdminNav';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import { SettingsAppShell } from '../components/SettingsAppShell';
import { SystemSettingsTab } from '../components/SystemSettingsTab';
import type { User } from '../../shared/services/types';
import { useMediaLocations } from '../services/useMediaLocations';
import { useSystemSettings } from '../services/useSystemSettings';

export interface SystemSettingsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  experience?: ClientExperience;
}

export function SystemSettingsPage({
  token,
  user,
  onLogout,
  experience = 'desktop',
}: SystemSettingsPageProps) {
  const isAdmin = user.role === 'admin';
  const mediaLocationsState = useMediaLocations(token, isAdmin);
  const systemSettingsState = useSystemSettings(token, isAdmin);

  if (!isAdmin) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="browse-page admin-page settings-page-v2">
      <AdminNav user={user} onLogout={onLogout} />

      <SettingsAppShell
        user={user}
        experience={experience}
        title="System"
        description="Configure media locations, runtime tools, playback defaults, and maintenance."
      >
        <SystemSettingsTab
          token={token}
          systemSettingsState={systemSettingsState}
          mediaLocationsState={mediaLocationsState}
        />
      </SettingsAppShell>
    </main>
  );
}
