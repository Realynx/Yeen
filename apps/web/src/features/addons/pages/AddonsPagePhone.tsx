import { Navigate } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { AddonsAdminPanel } from '../components/AddonsAdminPanel';

interface AddonsPagePhoneProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function AddonsPagePhone({
  token,
  user,
  onLogout,
}: AddonsPagePhoneProps) {
  if (user.role !== 'admin') {
    return <Navigate to="/settings" replace />;
  }

  return (
    <PhonePageShell pageKey="addons">
      <main className="browse-page admin-page settings-page-v2 addons-admin-page phone-addons-page">
        <PhonePageHeader user={user} onLogout={onLogout} />
        <AddonsAdminPanel token={token} />
      </main>
    </PhonePageShell>
  );
}
