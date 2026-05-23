import type { FormEventHandler } from 'react';
import { NavLink } from 'react-router-dom';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import type { User } from '../../shared/services/types';

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
    <header className="top-nav">
      <div className="top-nav-left">
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
        </nav>
      </div>

      <div className="top-nav-right">
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
