import { useEffect, useState } from 'react';
import {
  getPlaybackPlan,
  getTorrentStatus,
  isRemoteMediaId,
} from '../../shared/services/api';
import type { MediaItem, TorrentItem } from '../../shared/services/types';
import { loadPendingRemoteStreamTarget } from './pendingRemoteStream';

const DETAILS_TORRENT_PROGRESS_POLL_INTERVAL_MS = 3_000;
const DETAILS_TORRENT_HASH_REFRESH_INTERVAL_MS = 8_000;

const ACTIVE_DOWNLOAD_STATES = new Set([
  'downloading',
  'forceddl',
  'stalldl',
  'stalleddl',
  'metadl',
  'queueddl',
  'checkingdl',
]);

function isActiveDownloadingTorrentState(
  state: string | null | undefined,
): boolean {
  if (!state) {
    return false;
  }

  const normalized = state.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (ACTIVE_DOWNLOAD_STATES.has(normalized)) {
    return true;
  }

  return normalized.includes('dl');
}

function normalizeHash(hash: string | null | undefined): string | null {
  if (typeof hash !== 'string') {
    return null;
  }

  const cleaned = hash.trim().toLowerCase();
  return cleaned || null;
}

interface MediaTorrentProgressState {
  torrent: TorrentItem | null;
  indexPendingReason: string | null;
  trackedHash: string | null;
}

export function useMediaTorrentProgress(
  token: string,
  mediaId: string,
  current: MediaItem | null,
): MediaTorrentProgressState {
  const [trackedHash, setTrackedHash] = useState<string | null>(null);
  const [torrent, setTorrent] = useState<TorrentItem | null>(null);
  const [indexPendingReason, setIndexPendingReason] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshTrackedHash() {
      if (!current) {
        if (!cancelled) {
          setTrackedHash(null);
        }
        return;
      }

      const remoteLookup = current.isRemote || isRemoteMediaId(mediaId);
      if (remoteLookup) {
        const pendingTarget = loadPendingRemoteStreamTarget();
        const pendingHash =
          pendingTarget?.remoteMediaId === mediaId
            ? normalizeHash(pendingTarget.torrentHash)
            : null;

        if (!cancelled) {
          setTrackedHash(pendingHash);
        }
        return;
      }

      try {
        const playback = await getPlaybackPlan(token, current.id);
        if (!cancelled) {
          setTrackedHash(normalizeHash(playback.torrent?.hash));
        }
      } catch {
        if (!cancelled) {
          setTrackedHash(null);
        }
      }
    }

    void refreshTrackedHash();

    const refreshIntervalId = window.setInterval(() => {
      void refreshTrackedHash();
    }, DETAILS_TORRENT_HASH_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshIntervalId);
    };
  }, [current, mediaId, token]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!trackedHash) {
      setTorrent(null);
      setIndexPendingReason(null);
      return;
    }

    const activeHash = trackedHash;

    let cancelled = false;
    let inFlight = false;

    async function pollTorrent() {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const response = await getTorrentStatus(token, activeHash);
        if (cancelled) {
          return;
        }

        const activeTorrent =
          response.torrent
          && isActiveDownloadingTorrentState(response.torrent.state)
            ? response.torrent
            : null;

        setTorrent(activeTorrent);
        setIndexPendingReason(
          response.indexResult.status === 'pending'
            ? response.indexResult.reason
            : null,
        );
      } catch {
        if (!cancelled) {
          setTorrent(null);
          setIndexPendingReason(null);
        }
      } finally {
        inFlight = false;
      }
    }

    void pollTorrent();

    const pollIntervalId = window.setInterval(() => {
      void pollTorrent();
    }, DETAILS_TORRENT_PROGRESS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollIntervalId);
    };
  }, [token, trackedHash]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    torrent,
    indexPendingReason,
    trackedHash,
  };
}
