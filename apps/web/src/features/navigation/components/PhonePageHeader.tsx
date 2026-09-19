import type { FormEventHandler, ReactNode } from 'react';
import { LibrarySearchForm } from './LibrarySearchForm';
import { ProfileMenu } from './ProfileMenu';
import type { User } from '../../shared/services/types';
import { MediaModeSwitchSlot } from '../../media-mode/components/MediaModeSwitcher';

interface PhonePageHeaderProps {
  user: User;
  onLogout: () => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  onSearchSubmit?: FormEventHandler<HTMLFormElement>;
  onOpenRandomDetails?: (() => void | Promise<void>) | null;
  randomDisabled?: boolean;
  leadingAction?: ReactNode;
}

export function PhonePageHeader(props: PhonePageHeaderProps) {
  const {
    user,
    onLogout,
    query,
    onQueryChange,
    onSearchSubmit,
    onOpenRandomDetails = null,
    randomDisabled = false,
    leadingAction = null,
  } = props;

  const canRenderSearch =
    typeof query === 'string'
    && typeof onQueryChange === 'function'
    && typeof onSearchSubmit === 'function';

  return (
    <header className={canRenderSearch ? 'phone-page-header has-search' : 'phone-page-header'}>
      <div className="phone-page-header-controls">
        {leadingAction ? (
          <div className="phone-page-leading-action">{leadingAction}</div>
        ) : null}

        {canRenderSearch ? (
          <div className="phone-page-search">
            <LibrarySearchForm
              query={query}
              onQueryChange={onQueryChange}
              onSearchSubmit={onSearchSubmit}
              placeholder="Search titles"
              onOpenRandomDetails={onOpenRandomDetails}
              randomDisabled={randomDisabled}
            />
          </div>
        ) : null}

        <div className="phone-page-profile">
          <ProfileMenu user={user} onLogout={onLogout} />
        </div>
      </div>
      <MediaModeSwitchSlot placement="phone-header" />
    </header>
  );
}
