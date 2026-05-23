import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import {
  indexTorrentMedia,
  searchNyaa,
  startNyaaDownload,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  MediaItem,
  NyaaSearchResponse,
  NyaaSortDirection,
  NyaaSortField,
} from '../../shared/services/types';
import { normalizeTitleKey } from './mediaDetailsUtils';
import {
  loadPendingRemoteStreamTarget,
  persistPendingRemoteStreamTarget,
  type PendingLocalStreamTarget,
} from './pendingRemoteStream';

interface RequestNyaaSearchOptions {
  force?: boolean;
  query?: string;
  page?: number;
  sortBy?: NyaaSortField;
  sortDirection?: NyaaSortDirection;
}

export type NyaaStartActionMode = 'stream' | 'download';

export interface PendingNyaaAction {
  id: string;
  mode: NyaaStartActionMode;
}

export interface NyaaFlowState {
  searchResponse: NyaaSearchResponse | null;
  searchLoading: boolean;
  searchRequested: boolean;
  searchError: string | null;
  pendingAction: PendingNyaaAction | null;
  actionSuccess: string | null;
  actionError: string | null;
  requestSearch: (options?: RequestNyaaSearchOptions) => Promise<void>;
  handleStartStream: (
    item: NyaaSearchResponse['results'][number],
  ) => Promise<void>;
  handleStartDownload: (
    item: NyaaSearchResponse['results'][number],
  ) => Promise<void>;
}

const DEFAULT_NYAA_PAGE = 1;
const DEFAULT_NYAA_SORT_BY: NyaaSortField = 'seeders';
const DEFAULT_NYAA_SORT_DIRECTION: NyaaSortDirection = 'desc';

export function useNyaaFlow(
  token: string,
  mediaId: string,
  current: MediaItem | null,
  navigate: NavigateFunction,
): NyaaFlowState {
  const [searchResponse, setSearchResponse] =
    useState<NyaaSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRequested, setSearchRequested] = useState(false);
  const [lastSearchKey, setLastSearchKey] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<PendingNyaaAction | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingLocalStreamTarget, setPendingLocalStreamTarget] =
    useState<PendingLocalStreamTarget | null>(() =>
      loadPendingRemoteStreamTarget(),
    );

  const requestSearch = useCallback(
    async (options?: RequestNyaaSearchOptions) => {
      const remoteQuery = (options?.query ?? current?.title ?? '').trim();
      const page =
        typeof options?.page === 'number' && Number.isFinite(options.page)
          ? Math.max(1, Math.floor(options.page))
          : DEFAULT_NYAA_PAGE;
      const sortBy = options?.sortBy ?? DEFAULT_NYAA_SORT_BY;
      const sortDirection = options?.sortDirection ?? DEFAULT_NYAA_SORT_DIRECTION;
      const searchKey = `${remoteQuery.toLowerCase()}::p${page}::${sortBy}::${sortDirection}`;

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
        const response = await searchNyaa(token, remoteQuery, {
          limit: 24,
          page,
          sortBy,
          sortDirection,
        });
        setSearchResponse(response);
        setLastSearchKey(searchKey);
      } catch (searchErrorEx) {
        setSearchResponse(null);
        setSearchError(
          toApiErrorMessage(searchErrorEx, 'Failed to search Nyaa.'),
        );
      } finally {
        setSearchLoading(false);
      }
    },
    [
      current?.title,
      lastSearchKey,
      searchError,
      searchLoading,
      searchResponse,
      token,
    ],
  );

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

  useEffect(() => {
    persistPendingRemoteStreamTarget(pendingLocalStreamTarget);
  }, [pendingLocalStreamTarget]);

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
    const torrentHashRaw = localStreamTarget.torrentHash;

    if (!torrentHashRaw) {
      setActionError(
        'Lost track of the in-progress torrent (no qBittorrent hash). '
          + 'Please click Stream or Download again to retry.',
      );
      setActionSuccess(null);
      setPendingLocalStreamTarget(null);
      return;
    }

    const torrentHash = torrentHashRaw;

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
        const result = await indexTorrentMedia(token, torrentHash);
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
  }, [mediaId, navigate, pendingAction, pendingLocalStreamTarget, token]);

  const handleStartAction = useCallback(
    async (
      item: NyaaSearchResponse['results'][number],
      mode: NyaaStartActionMode,
    ) => {
      if (!item.downloadUrl) {
        setActionError('This Nyaa result does not expose a torrent download URL.');
        return;
      }

      if (pendingAction) {
        return;
      }

      const isStreamStart = mode === 'stream';

      setPendingAction({ id: item.id, mode });
      setActionError(null);
      setActionSuccess(null);

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
        const response = await startNyaaDownload(token, {
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
          const indexedMatch = response.indexResult.media;
          setPendingLocalStreamTarget(null);
          setActionSuccess(
            `${response.message} Indexed "${indexedMatch.title}" into your library.`,
          );
          return;
        }

        if (response.hash) {
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
      } catch (downloadError) {
        setPendingLocalStreamTarget(null);
        setActionError(
          toApiErrorMessage(
            downloadError,
            isStreamStart
              ? 'Failed to start Nyaa stream in qBittorrent.'
              : 'Failed to start Nyaa download in qBittorrent.',
          ),
        );
      } finally {
        setPendingAction(null);
      }
    },
    [current, mediaId, navigate, pendingAction, token],
  );

  const handleStartStream = useCallback(
    async (item: NyaaSearchResponse['results'][number]) => {
      await handleStartAction(item, 'stream');
    },
    [handleStartAction],
  );

  const handleStartDownload = useCallback(
    async (item: NyaaSearchResponse['results'][number]) => {
      await handleStartAction(item, 'download');
    },
    [handleStartAction],
  );

  useEffect(() => {
    if (!searchRequested) {
      return;
    }

    setActionSuccess(null);
    setActionError(null);
  }, [lastSearchKey, searchRequested]);

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
