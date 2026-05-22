import { Navigate } from 'react-router-dom';
import { AdminNav } from '../components/AdminNav';
import { SystemSettingsTab } from '../components/settings/SystemSettingsTab';
import type { User } from '../lib/types';
import { useMediaLocations } from './settings/useMediaLocations';
import { useSystemSettings } from './settings/useSystemSettings';

interface SystemSettingsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function SystemSettingsPage({
  token,
  user,
  onLogout,
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

      <SystemSettingsTab
        token={token}
        systemSettingsState={systemSettingsState}
        mediaLocationsState={mediaLocationsState}
      />
    </main>
  );
}
