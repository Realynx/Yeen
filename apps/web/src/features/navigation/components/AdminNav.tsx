import { NavLink, useNavigate } from 'react-router-dom';
import { ProfileMenu } from './ProfileMenu';
import type { User } from '../../shared/services/types';
import { canAccessTorrentTools, isAdminRole } from '../../auth/services/roles';

interface AdminNavProps {
  user: User;
  onLogout: () => void;
}

interface AdminNavLink {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  torrentAccessOnly?: boolean;
}

const ADMIN_NAV_LINKS: AdminNavLink[] = [
  { to: '/settings', label: 'Profile', end: true },
  { to: '/admin/system', label: 'System', adminOnly: true },
  { to: '/admin/accounts', label: 'Accounts', adminOnly: true },
  { to: '/admin/downloads', label: 'Downloads', torrentAccessOnly: true },
];

export function AdminNav({ user, onLogout }: AdminNavProps) {
  const navigate = useNavigate();
  const isAdmin = isAdminRole(user.role);
  const hasTorrentAccess = canAccessTorrentTools(user.role);

  const visibleLinks = ADMIN_NAV_LINKS.filter(
    (link) =>
      (!link.adminOnly || isAdmin)
      && (!link.torrentAccessOnly || hasTorrentAccess),
  );

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <p className="brand-mark">YEEN</p>
        <nav className="browse-links" aria-label="Admin">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              className={({ isActive }) =>
                isActive ? 'browse-link active' : 'browse-link'
              }
              end={link.end}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="top-nav-right">
        <button
          className="ghost-button"
          type="button"
          onClick={() => navigate('/')}
        >
          Library
        </button>
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
