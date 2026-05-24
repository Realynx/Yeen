import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import {
  indexTorrentMedia,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { PendingLocalStreamTarget } from './pendingRemoteStream';

interface UsePendingTorrentIndexingOptions<TPendingAction> {
  token: string;
  mediaId: string;
  navigate: NavigateFunction;
  pendingAction: TPendingAction | null;
  pendingLocalStreamTarget: PendingLocalStreamTarget | null;
  setPendingLocalStreamTarget: Dispatch<SetStateAction<PendingLocalStreamTarget | null>>;
  setPendingAction: Dispatch<SetStateAction<TPendingAction | null>>;
  setActionSuccess: Dispatch<SetStateAction<string | null>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
}

export function usePendingTorrentIndexing<TPendingAction>({
  token,
  mediaId,
  navigate,
  pendingAction,
  pendingLocalStreamTarget,
  setPendingLocalStreamTarget,
  setPendingAction,
  setActionSuccess,
  setActionError,
}: UsePendingTorrentIndexingOptions<TPendingAction>) {
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (
      !pendingLocalStreamTarget
      || pendingLocalStreamTarget.remoteMediaId !== mediaId
    ) {
      return;
    }

    if (pendingAction) {
      return;
    }

    const localStreamTarget = pendingLocalStreamTarget;
    const torrentHash = localStreamTarget.torrentHash;

    if (!torrentHash) {
      setActionError(
        'Lost track of the in-progress torrent (no qBittorrent hash). '
          + 'Please click Stream or Download again to retry.',
      );
      setActionSuccess(null);
      setPendingLocalStreamTarget(null);
      return;
    }

    const resolvedTorrentHash = torrentHash;

    let cancelled = false;
    let indexInFlight = false;

    const waitingText =
      localStreamTarget.intent === 'stream'
        ? 'Waiting for local indexing while the torrent downloads in the background.'
        : 'Waiting for enough of the torrent to download before indexing into the library.';

    setActionSuccess((previous) => previous ?? waitingText);

    async function attemptIndex() {
      if (cancelled || indexInFlight) {
        return;
      }

      indexInFlight = true;

      try {
        const result = await indexTorrentMedia(token, resolvedTorrentHash);
        if (cancelled) {
          return;
        }

        if (result.status === 'pending') {
          setActionSuccess(result.reason);
          setActionError(null);
          return;
        }

        const indexedMatch = result.media;

        setPendingLocalStreamTarget(null);
        setPendingAction(null);
        setActionError(null);

        if (localStreamTarget.intent === 'stream') {
          setActionSuccess(
            `Indexed "${indexedMatch.title}". Opening player...`,
          );
          navigate(`/player/${indexedMatch.id}`);
        } else {
          setActionSuccess(
            `Indexed "${indexedMatch.title}" into your library. Download continues in qBittorrent.`,
          );
        }
      } catch (indexError) {
        if (!cancelled) {
          setActionError(
            toApiErrorMessage(
              indexError,
              'Failed to index downloading torrent file.',
            ),
          );
        }
      } finally {
        indexInFlight = false;
      }
    }

    void attemptIndex();

    const pollIntervalId = window.setInterval(() => {
      void attemptIndex();
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollIntervalId);
    };
  }, [
    mediaId,
    navigate,
    pendingAction,
    pendingLocalStreamTarget,
    setActionError,
    setActionSuccess,
    setPendingAction,
    setPendingLocalStreamTarget,
    token,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */
}
