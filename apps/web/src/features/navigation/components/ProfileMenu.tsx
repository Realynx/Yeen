import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { canAccessTorrentTools, isAdminRole } from '../../auth/services/roles';
import './profile-menu.css';

interface ProfileMenuProps {
  user: User;
  onLogout: () => void;
}

export function ProfileMenu({ user, onLogout }: ProfileMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = isAdminRole(user.role);
  const hasTorrentAccess = canAccessTorrentTools(user.role);

  const initials = useMemo(() => {
    const parts = user.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (parts.length === 0) {
      return 'U';
    }

    return parts
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [user.name]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', closeOnOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
    };
  }, [open]);

  function goToSettings() {
    setOpen(false);
    navigate('/settings');
  }

  function goToSystemSettings() {
    setOpen(false);
    navigate('/admin/system');
  }

  function goToAccountsAccess() {
    setOpen(false);
    navigate('/admin/accounts');
  }

  function goToDownloadControl() {
    setOpen(false);
    navigate('/admin/downloads');
  }

  function handleSignOut() {
    setOpen(false);
    onLogout();
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        className="profile-avatar-button"
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="Open profile menu"
        aria-expanded={open}
      >
        {user.avatarDataUrl ? (
          <img
            src={user.avatarDataUrl}
            alt={`${user.name} profile`}
            className="profile-avatar profile-avatar-image"
          />
        ) : (
          <span className="profile-avatar">{initials}</span>
        )}
      </button>

      {open ? (
        <div className="profile-dropdown" role="menu" aria-label="Profile menu">
          <div className="profile-dropdown-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>

          <button className="profile-dropdown-item" type="button" onClick={goToSettings}>
            User Settings
          </button>

          {isAdmin ? (
            <button className="profile-dropdown-item" type="button" onClick={goToSystemSettings}>
              System Settings
            </button>
          ) : null}

          {isAdmin ? (
            <button className="profile-dropdown-item" type="button" onClick={goToAccountsAccess}>
              Accounts & Access
            </button>
          ) : null}

          {hasTorrentAccess ? (
            <button className="profile-dropdown-item" type="button" onClick={goToDownloadControl}>
              Download Control
            </button>
          ) : null}

          <button className="profile-dropdown-item" type="button" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
