import { Navigate } from 'react-router-dom';
import { AdminNav } from '../../navigation/components/AdminNav';
import { TorrentControlPanel } from '../components/TorrentControlPanel';
import type { User } from '../../shared/services/types';
import { canAccessTorrentTools, isAdminRole } from '../../auth/services/roles';
import { useSystemSettings } from '../services/useSystemSettings';

interface DownloadControlPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function DownloadControlPage({
  token,
  user,
  onLogout,
}: DownloadControlPageProps) {
  const isAdmin = isAdminRole(user.role);
  const hasTorrentAccess = canAccessTorrentTools(user.role);
  const systemSettingsState = useSystemSettings(token, isAdmin);

  if (!hasTorrentAccess) {
    return <Navigate to="/" replace />;
  }

  const defaultOrderMode =
    systemSettingsState.systemSettings?.qbittorrentDefaultOrderMode ?? 'random';

  return (
    <main className="browse-page admin-page settings-page-v2">
      <AdminNav user={user} onLogout={onLogout} />

      <section className="settings-content-grid">
        {systemSettingsState.systemError ? (
          <p className="error-text">{systemSettingsState.systemError}</p>
        ) : null}

        <TorrentControlPanel token={token} defaultOrderMode={defaultOrderMode} />
      </section>
    </main>
  );
}
