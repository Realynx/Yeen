import { NavLink } from 'react-router-dom';
import { BroadcastNavBadge } from '../../broadcast/components/BroadcastNavBadge';
import { ProfileMenu } from './ProfileMenu';
import type { User } from '../../shared/services/types';
import { useAddonHost } from '../../addons/runtime/AddonHostContext';
import { MediaModeSwitchSlot } from '../../media-mode/components/MediaModeSwitcher';
import { createSettingsNavigation } from '../../settings/components/settingsNavigation';
import { MediaHomeButton } from './MediaHomeButton';

interface AdminNavProps {
  user: User;
  onLogout: () => void;
}

export function AdminNav({ user, onLogout }: AdminNavProps) {
  const { navigation } = useAddonHost();
  const visibleLinks = createSettingsNavigation(user.role, navigation)
    .flatMap((group) => group.items);

  return (
    <header className="top-nav" data-tv-focus-zone="top-nav">
      <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
        <p className="brand-mark">YEEN</p>
        <nav className="browse-links" aria-label="Admin">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.id}
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

      <MediaModeSwitchSlot placement="top-nav" />

      <div data-tv-focus-lane-id="top-nav-broadcast">
        <BroadcastNavBadge />
      </div>

      <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
        <MediaHomeButton />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
