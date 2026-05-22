import type { FormEvent } from 'react';
import { LibrarySearchForm } from '../../components/LibrarySearchForm';
import { ProfileMenu } from '../../components/ProfileMenu';
import type { User } from '../../lib/types';

interface PlayerTopBarProps {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onOpenRandomDetails: () => void | Promise<void>;
  user: User;
  onLogout: () => void;
}

export function PlayerTopBar({
  title,
  query,
  onQueryChange,
  onSearchSubmit,
  onBack,
  onOpenRandomDetails,
  user,
  onLogout,
}: PlayerTopBarProps) {
  return (
    <header className="top-nav">
      <div className="top-nav-left">
        <button
          type="button"
          className="nav-back-button"
          aria-label="Go back"
          title="Go back"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <p className="brand-mark">YEEN</p>
        <p className="page-nav-title" title={title}>{title}</p>
      </div>

      <div className="top-nav-right">
        <LibrarySearchForm
          query={query}
          onQueryChange={onQueryChange}
          onSearchSubmit={onSearchSubmit}
          placeholder="Search titles and paths"
          onOpenRandomDetails={onOpenRandomDetails}
        />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
