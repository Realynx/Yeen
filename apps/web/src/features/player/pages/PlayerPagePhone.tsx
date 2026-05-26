import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMedia } from '../../shared/services/api';
import type { User } from '../../shared/services/types';
import { PlayerPage } from './PlayerPage';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { PhonePageHeader } from '../../navigation/components/PhonePageHeader';
import { PhonePageShell } from '../../navigation/components/PhonePageShell';
import { useSafeBackNavigation } from '../../navigation/services/safeBackNavigation';

interface PlayerPagePhoneProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function PlayerPagePhone({ token, user, onLogout }: PlayerPagePhoneProps) {
  const navigate = useNavigate();
  const navigateBackSafely = useSafeBackNavigation('/library');
  const [query, setQuery] = useState('');

  const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }, [navigate, query]);

  const handleBackNavigation = useCallback(() => {
    navigateBackSafely();
  }, [navigateBackSafely]);

  const openRandomDetails = useCallback(async () => {
    try {
      const mediaItems = await listMedia(token);
      const randomCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!randomCandidate) {
        return;
      }

      navigate(`/details/${randomCandidate.id}`);
    } catch {
      // Keep playback uninterrupted if random lookup fails.
    }
  }, [navigate, token]);

  return (
    <PhonePageShell pageKey="player" showBottomNav={false}>
      <PlayerPage
        token={token}
        user={user}
        onLogout={onLogout}
        hideTopNav
        headerContent={(
          <PhonePageHeader
            user={user}
            onLogout={onLogout}
            query={query}
            onQueryChange={setQuery}
            onSearchSubmit={handleSearchSubmit}
            onOpenRandomDetails={openRandomDetails}
            leadingAction={(
              <button
                type="button"
                className="phone-details-back-button phone-player-back-button"
                onClick={handleBackNavigation}
                aria-label="Go back"
              >
                <span aria-hidden="true">←</span>
                Back
              </button>
            )}
          />
        )}
      />
    </PhonePageShell>
  );
}
