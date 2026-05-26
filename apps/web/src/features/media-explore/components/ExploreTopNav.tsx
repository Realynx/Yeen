import { NavLink } from 'react-router-dom';
import type { FormEvent } from 'react';
import { BroadcastNavBadge } from '../../broadcast/components/BroadcastNavBadge';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import type { User } from '../../shared/services/types';

interface ExploreTopNavProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenRandomDetails: () => void;
  randomDisabled: boolean;
  user: User;
  onLogout: () => void;
}

export function ExploreTopNav({
  query,
  onQueryChange,
  onSearchSubmit,
  onOpenRandomDetails,
  randomDisabled,
  user,
  onLogout,
}: ExploreTopNavProps) {
  return (
    <header className="top-nav" data-tv-focus-zone="top-nav">
      <div className="top-nav-left" data-tv-focus-lane-id="top-nav-links">
        <p className="brand-mark">YEEN</p>
        <nav className="browse-links" aria-label="Browse">
          <NavLink
            className={({ isActive }) =>
              isActive ? 'browse-link active' : 'browse-link'
            }
            end
            to="/"
          >
            Home
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              isActive ? 'browse-link active' : 'browse-link'
            }
            to="/library"
          >
            Library
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              isActive ? 'browse-link active' : 'browse-link'
            }
            to="/explore"
          >
            Explore
          </NavLink>
        </nav>
      </div>

      <div data-tv-focus-lane-id="top-nav-broadcast">
        <BroadcastNavBadge />
      </div>

      <div className="top-nav-right" data-tv-focus-lane-id="top-nav-actions">
        <LibrarySearchForm
          query={query}
          onQueryChange={onQueryChange}
          onSearchSubmit={onSearchSubmit}
          placeholder="Search titles and paths"
          onOpenRandomDetails={onOpenRandomDetails}
          randomDisabled={randomDisabled}
        />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
