import { Navigate } from 'react-router-dom';
import { AdminNav } from '../../navigation/components/AdminNav';
import { AdminAccountsPanel } from '../components/AdminAccountsPanel';
import type { User } from '../../shared/services/types';
import { useAdminAccounts } from '../services/useAdminAccounts';

interface AccountAccessPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function AccountAccessPage({
  token,
  user,
  onLogout,
}: AccountAccessPageProps) {
  const isAdmin = user.role === 'admin';
  const adminAccountsState = useAdminAccounts(token, isAdmin);

  if (!isAdmin) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="browse-page admin-page settings-page-v2 admin-accounts-page">
      <AdminNav user={user} onLogout={onLogout} />

      <AdminAccountsPanel adminAccountsState={adminAccountsState} />
    </main>
  );
}
