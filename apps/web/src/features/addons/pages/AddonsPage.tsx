import { Navigate } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { AdminNav } from '../../navigation/components/AdminNav';
import { AddonsAdminPanel } from '../components/AddonsAdminPanel';

interface AddonsPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function AddonsPage({ token, user, onLogout }: AddonsPageProps) {
  if (user.role !== 'admin') {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="browse-page admin-page settings-page-v2 addons-admin-page">
      <AdminNav user={user} onLogout={onLogout} />
      <AddonsAdminPanel token={token} />
    </main>
  );
}
