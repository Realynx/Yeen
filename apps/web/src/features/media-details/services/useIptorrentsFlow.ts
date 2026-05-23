import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import {
  indexTorrentMedia,
  searchIptorrents,
  startIptorrentsDownload,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  IptorrentsSearchResponse,
  MediaItem,
} from '../../shared/services/types';
import { normalizeTitleKey } from './mediaDetailsUtils';
import {
  loadPendingRemoteStreamTarget,
  persistPendingRemoteStreamTarget,
  type PendingLocalStreamTarget,
} from './pendingRemoteStream';

export type IptorrentStartActionMode = 'stream' | 'download';

export interface PendingIptorrentAction {
  id: string;
  mode: IptorrentStartActionMode;
}

export interface IptorrentsFlowState {
  searchResponse: IptorrentsSearchResponse | null;
  searchLoading: boolean;
  searchRequested: boolean;
  searchError: string | null;
  pendingAction: PendingIptorrentAction | null;
  actionSuccess: string | null;
  actionError: string | null;
  requestSearch: (options?: { force?: boolean }) => Promise<void>;
  handleStartStream: (
    item: IptorrentsSearchResponse['results'][number],
  ) => Promise<void>;
  handleStartDownload: (
    item: IptorrentsSearchResponse['results'][number],
  ) => Promise<void>;
}

export function useIptorrentsFlow(
  token: string,
  mediaId: string,
  current: MediaItem | null,
  navigate: NavigateFunction,
): IptorrentsFlowState {
  const [searchResponse, setSearchResponse] =
    useState<IptorrentsSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRequested, setSearchRequested] = useState(false);
  const [lastSearchKey, setLastSearchKey] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<PendingIptorrentAction | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingLocalStreamTarget, setPendingLocalStreamTarget] =
    useState<PendingLocalStreamTarget | null>(() =>
      loadPendingRemoteStreamTarget(),
    );

  const requestSearch = useCallback(
    async (options?: { force?: boolean }) => {
      const remoteQuery = current?.title?.trim() ?? '';
      const mediaType = current?.type === 'show' ? 'show' : 'movie';
      const searchKey = `${remoteQuery.toLowerCase()}::${mediaType}`;

      setSearchRequested(true);

      if (!remoteQuery) {
        setSearchResponse(null);
        setSearchError('No media title is available to search.');
        setSearchLoading(false);
        return;
      }

      if (searchLoading) {
        return;
      }

      if (
        !options?.force
        && searchResponse
        && !searchError
        && lastSearchKey === searchKey
      ) {
        return;
      }

      setSearchLoading(true);
      setSearchError(null);

      try {
        const response = await searchIptorrents(token, remoteQuery, {
          limit: 24,
          mediaType,
        });
        setSearchResponse(response);
        setLastSearchKey(searchKey);
      } catch (searchErrorEx) {
        setSearchResponse(null);
        setSearchError(
          toApiErrorMessage(searchErrorEx, 'Failed to search IPTorrents.'),
        );
      } finally {
        setSearchLoading(false);
      }
    },
    [
      current?.title,
      current?.type,
      lastSearchKey,
      searchError,
      searchLoading,
      searchResponse,
      token,
    ],
  );

  // Reset transient download state when the underlying media id changes.
  useEffect(() => {
    setSearchResponse(null);
    setSearchLoading(false);
    setSearchRequested(false);
    setSearchError(null);
    setLastSearchKey(null);
    setPendingAction(null);
    setPendingLocalStreamTarget((previous) => {
      if (!previous) {
        return null;
      }

      return previous.remoteMediaId === mediaId ? previous : null;
    });
    setActionSuccess(null);
    setActionError(null);
  }, [current?.id, mediaId]);

  // Persist the pending stream target across reloads.
  useEffect(() => {
    persistPendingRemoteStreamTarget(pendingLocalStreamTarget);
  }, [pendingLocalStreamTarget]);

  // Poll the per-torrent index endpoint while waiting for enough of the
  // download to land on disk to probe and add a single media entry. This
  // effect also owns the user-facing "waiting for..." status text so we never
  // race against a stale fallback message.
  useEffect(() => {
    if (
      !pendingLocalStreamTarget ||
      pendingLocalStreamTarget.remoteMediaId !== mediaId
    ) {
      return;
    }

    if (pendingAction) {
      // Initial start request is still in flight; handleStartAction owns the
      // message until the server responds.
      return;
    }

    const localStreamTarget = pendingLocalStreamTarget;
    const torrentHash = localStreamTarget.torrentHash;

    if (!torrentHash) {
      // We persisted a pending target but never received a hash from
      // qBittorrent (or it was a session from before the response landed).
      // Surface a clear, non-static message and clear the dead target so the
      // user isn't stuck on the generic "Waiting for local indexing..." text.
      setActionError(
        'Lost track of the in-progress torrent (no qBittorrent hash). '
          + 'Please click Stream or Download again to retry.',
      );
      setActionSuccess(null);
      setPendingLocalStreamTarget(null);
      return;
    }

    let cancelled = false;
    let indexInFlight = false;

    const waitingText =
      localStreamTarget.intent === 'stream'
        ? 'Waiting for local indexing while the torrent downloads in the background.'
        : 'Waiting for enough of the torrent to download before indexing into the library.';

    // Seed an initial message so the user always sees current status, but
    // don't clobber a more specific message set by handleStartAction.
    setActionSuccess((previous) => previous ?? waitingText);

    async function attemptIndex() {
      if (cancelled || indexInFlight) {
        return;
      }

      indexInFlight = true;

      try {
        const result = await indexTorrentMedia(token, torrentHash!);
        if (cancelled) {
          return;
        }

        if (result.status === 'pending') {
          // Always overwrite so the server's reason is what the user sees.
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
          // Navigate directly to the player. Going through /details first and
          // then setTimeout-ing into /player runs afoul of this effect's
          // cleanup (state change + URL change re-trigger the effect, which
          // would clear the pending timer before it fires).
          navigate(`/player/${indexedMatch.id}`);
        } else {
          setActionSuccess(
            `Indexed "${indexedMatch.title}" into your library. Download continues in qBittorrent.`,
          );
        }
      } catch (indexError) {
        if (!cancelled) {
          // Surface the failure but KEEP polling — qBittorrent or the bridge
          // may simply be temporarily unreachable and recover shortly.
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
  }, [mediaId, navigate, pendingAction, pendingLocalStreamTarget, token]);

  const handleStartAction = useCallback(
    async (
      item: IptorrentsSearchResponse['results'][number],
      mode: IptorrentStartActionMode,
    ) => {
      if (!item.downloadUrl) {
        setActionError('This IPTorrents result does not expose a torrent download URL.');
        return;
      }

      if (pendingAction) {
        return;
      }

      const isStreamStart = mode === 'stream';

      setPendingAction({ id: item.id, mode });
      setActionError(null);
      setActionSuccess(null);

      // Both stream and background downloads should drive indexing so the
      // new media lands in the library. Only the stream intent navigates to
      // the player once indexed.
      const targetTitle = current?.title?.trim() || item.title.trim();
      const targetNormalizedTitle = current?.normalizedTitle?.trim()
        || normalizeTitleKey(targetTitle);
      const targetType = current?.type ?? 'movie';
      const posterUrlRaw = current?.previewImagePath?.trim() ?? '';
      const backdropUrlRaw = current?.backdropImagePath?.trim() ?? '';
      const posterUrl = /^https?:\/\//i.test(posterUrlRaw) ? posterUrlRaw : null;
      const backdropUrl = /^https?:\/\//i.test(backdropUrlRaw)
        ? backdropUrlRaw
        : null;

      setPendingLocalStreamTarget({
        remoteMediaId: mediaId,
        sourceResultId: item.id,
        title: targetTitle,
        normalizedTitle: targetNormalizedTitle,
        releaseYear: current?.releaseYear ?? null,
        type: targetType,
        startedAtMs: Date.now(),
        torrentHash: null,
        intent: isStreamStart ? 'stream' : 'background',
      });

      try {
        const response = await startIptorrentsDownload(token, {
          downloadUrl: item.downloadUrl,
          title: item.title,
          intent: isStreamStart ? 'stream' : 'background',
          metadataHint: {
            title: targetTitle,
            normalizedTitle: targetNormalizedTitle,
            releaseYear: current?.releaseYear ?? null,
            mediaType: targetType,
            description: current?.description ?? null,
            tags: current?.tags ?? [],
            posterUrl,
            backdropUrl,
            remoteSource: current?.remoteSource ?? null,
            remoteSourceId: current?.remoteSourceId ?? null,
          },
        });

        if (response.indexResult?.status === 'indexed' && !isStreamStart) {
          // Background downloads can short-circuit once indexed.
          const indexedMatch = response.indexResult.media;
          setPendingLocalStreamTarget(null);
          setActionSuccess(
            `${response.message} Indexed "${indexedMatch.title}" into your library.`,
          );
          return;
        }

        if (response.hash) {
          // Hand off to player-preparing mode so streaming can transition
          // directly into playback as soon as indexing/probing succeeds.
          if (isStreamStart) {
            setPendingLocalStreamTarget(null);
            const params = new URLSearchParams({
              prepareHash: response.hash,
              title: targetTitle,
            });
            navigate(`/player/${encodeURIComponent(mediaId)}?${params.toString()}`);
            return;
          }

          setPendingLocalStreamTarget((previous) => {
            if (!previous) {
              return {
                remoteMediaId: mediaId,
                sourceResultId: item.id,
                title: targetTitle,
                normalizedTitle: targetNormalizedTitle,
                releaseYear: current?.releaseYear ?? null,
                type: targetType,
                startedAtMs: Date.now(),
                torrentHash: response.hash,
                intent: 'background',
              };
            }

            return {
              ...previous,
              torrentHash: response.hash,
              intent: 'background',
            };
          });

          setActionSuccess(
            `${response.message} Monitoring download and indexing files as they become available.`,
          );
          return;
        }

        setActionError(
          `${response.message} qBittorrent did not return a torrent id, so targeted indexing is unavailable.`,
        );
      } catch (startError) {
        if (isStreamStart) {
          setActionError(
            `${toApiErrorMessage(startError, 'Failed to start stream torrent.')} `
            + 'Index monitoring remains active in case qBittorrent starts shortly after recovery.',
          );
        } else {
          setActionError(
            `${toApiErrorMessage(startError, 'Failed to start torrent download.')} `
            + 'Index monitoring remains active in case qBittorrent starts shortly after recovery.',
          );
        }
      } finally {
        setPendingAction(null);
      }
    },
    [
      current?.normalizedTitle,
      current?.releaseYear,
      current?.title,
      current?.type,
      mediaId,
      navigate,
      pendingAction,
      token,
    ],
  );

  const handleStartStream = useCallback(
    async (item: IptorrentsSearchResponse['results'][number]) => {
      await handleStartAction(item, 'stream');
    },
    [handleStartAction],
  );

  const handleStartDownload = useCallback(
    async (item: IptorrentsSearchResponse['results'][number]) => {
      await handleStartAction(item, 'download');
    },
    [handleStartAction],
  );

  return {
    searchResponse,
    searchLoading,
    searchRequested,
    searchError,
    pendingAction,
    actionSuccess,
    actionError,
    requestSearch,
    handleStartStream,
    handleStartDownload,
  };
}
