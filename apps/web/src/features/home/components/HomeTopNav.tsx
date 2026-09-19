import type { FormEventHandler } from 'react';
import { NavLink } from 'react-router-dom';
import { BroadcastNavBadge } from '../../broadcast/components/BroadcastNavBadge';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import type { User } from '../../shared/services/types';
import { AddonNavigationEntries } from '../../addons/runtime/AddonHostSlots';
import { MediaModeSwitchSlot } from '../../media-mode/components/MediaModeSwitcher';

interface HomeTopNavProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: FormEventHandler<HTMLFormElement>;
  onOpenRandomDetails: () => void;
  hasRandomDetailsCandidate: boolean;
  user: User;
  onLogout: () => void;
}

export function HomeTopNav({
  query,
  onQueryChange,
  onSearchSubmit,
  onOpenRandomDetails,
  hasRandomDetailsCandidate,
  user,
  onLogout,
}: HomeTopNavProps) {
  return (
    <header className="top-nav" data-tv-focus-zone="top-nav">
      <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
        <p className="brand-mark">YEEN</p>
        <nav className="browse-links" aria-label="Browse">
          <NavLink
            className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
            end
            to="/"
          >
            Home
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
            to="/library"
          >
            Library
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'browse-link active' : 'browse-link')}
            to="/explore"
          >
            Explore
          </NavLink>
          <AddonNavigationEntries placement="browse" user={user} />
        </nav>
      </div>

      <MediaModeSwitchSlot placement="top-nav" />

      <div data-tv-focus-lane-id="top-nav-broadcast">
        <BroadcastNavBadge />
      </div>

      <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
        <LibrarySearchForm
          query={query}
          onQueryChange={onQueryChange}
          onSearchSubmit={onSearchSubmit}
          placeholder="Titles, folders, or metadata"
          onOpenRandomDetails={onOpenRandomDetails}
          randomDisabled={!hasRandomDetailsCandidate}
        />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
