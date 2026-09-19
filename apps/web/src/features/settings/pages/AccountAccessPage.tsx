import { Navigate } from 'react-router-dom';
import { AdminNav } from '../../navigation/components/AdminNav';
import { AdminAccountsPanel } from '../components/AdminAccountsPanel';
import { SettingsAppShell } from '../components/SettingsAppShell';
import type { ClientExperience } from '../../navigation/services/clientExperience';
import type { User } from '../../shared/services/types';
import { useAdminAccounts } from '../services/useAdminAccounts';

export interface AccountAccessPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  experience?: ClientExperience;
}

export function AccountAccessPage({
  token,
  user,
  onLogout,
  experience = 'desktop',
}: AccountAccessPageProps) {
  const isAdmin = user.role === 'admin';
  const adminAccountsState = useAdminAccounts(token, isAdmin);

  if (!isAdmin) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="browse-page admin-page settings-page-v2 admin-accounts-page">
      <AdminNav user={user} onLogout={onLogout} />

      <SettingsAppShell
        user={user}
        experience={experience}
        title="Accounts & access"
        description="Manage Account Roles, invitations, playback limits, and current activity."
      >
        <AdminAccountsPanel adminAccountsState={adminAccountsState} />
      </SettingsAppShell>
    </main>
  );
}
