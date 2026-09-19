import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../shared/services/types';
import { isAdminRole } from '../../auth/services/roles';
import { useBroadcast } from '../../broadcast/services/broadcast-context';
import { useDialogLayer } from '../hooks/useDialogLayer';
import { AddonProfileNavigationEntries } from '../../addons/runtime/AddonHostSlots';
import './profile-menu.css';

interface ProfileMenuProps {
  user: User;
  onLogout: () => void;
}

export function ProfileMenu({ user, onLogout }: ProfileMenuProps) {
  const navigate = useNavigate();
  const broadcast = useBroadcast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = isAdminRole(user.role);

  useDialogLayer({
    open,
    containerRef: dropdownRef,
    onRequestClose: () => {
      setOpen(false);
    },
    initialFocusSelector: '.profile-dropdown-item',
    lockBodyScroll: false,
  });

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

  function goToAddons() {
    setOpen(false);
    navigate('/admin/add-ons');
  }

  function handleSignOut() {
    setOpen(false);
    onLogout();
  }

  const viewerCountLabel =
    broadcast.viewerCount === 1
      ? '1 viewer'
      : `${broadcast.viewerCount} viewers`;

  function handleToggleBroadcast() {
    void broadcast.toggleEnabled();
  }

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        className="profile-avatar-button"
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="profile-menu-dropdown"
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
        <div
          ref={dropdownRef}
          id="profile-menu-dropdown"
          className="profile-dropdown"
          role="menu"
          aria-label="Profile menu"
        >
          <div className="profile-dropdown-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>

          <button className="profile-dropdown-item" type="button" role="menuitem" onClick={goToSettings}>
            User Settings
          </button>

          {isAdmin ? (
            <button className="profile-dropdown-item" type="button" role="menuitem" onClick={goToSystemSettings}>
              System Settings
            </button>
          ) : null}

          {isAdmin ? (
            <button className="profile-dropdown-item" type="button" role="menuitem" onClick={goToAccountsAccess}>
              Accounts & Access
            </button>
          ) : null}

          {isAdmin ? (
            <button className="profile-dropdown-item" type="button" role="menuitem" onClick={goToAddons}>
              Add-ons
            </button>
          ) : null}

          <AddonProfileNavigationEntries onNavigate={() => setOpen(false)} />

          <button
            className={`profile-dropdown-item broadcast-toggle ${broadcast.isEnabled ? 'is-live' : ''}`}
            type="button"
            role="menuitemcheckbox"
            onClick={handleToggleBroadcast}
            disabled={broadcast.updatingEnabled || broadcast.loading}
            aria-checked={broadcast.isEnabled}
          >
            {broadcast.updatingEnabled
              ? 'Updating Broadcast Mode...'
              : `Broadcast Mode: ${broadcast.isEnabled ? 'On' : 'Off'} (${viewerCountLabel})`}
          </button>

          <button className="profile-dropdown-item" type="button" role="menuitem" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
