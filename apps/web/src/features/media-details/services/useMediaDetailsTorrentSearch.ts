import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  searchIptorrents,
  searchNyaa,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { NyaaSortField } from '../../shared/services/types';
import { normalizeTitleKey } from './mediaDetailsUtils';
import {
  loadCachedBestTorrent,
  saveCachedBestTorrent,
} from './bestTorrentCache';
import {
  createInitialLocalState,
  type BestSeededTorrentResult,
  type MediaDetailsTorrentSearchState,
  type TorrentSearchLocalState,
  type UseMediaDetailsTorrentSearchArgs,
} from './mediaDetailsTorrentSearch.types';
import {
  type AutoTorrentMode,
  TORRENT_TRACKERS,
  type TorrentTrackerId,
} from './torrentSearchTypes';

export type {
  MediaDetailsTorrentSearchState,
  UseMediaDetailsTorrentSearchArgs,
} from './mediaDetailsTorrentSearch.types';

export function useMediaDetailsTorrentSearch({
  token,
  mediaId,
  current,
  hasTorrentAccess,
  iptorrents,
  nyaa,
}: UseMediaDetailsTorrentSearchArgs): MediaDetailsTorrentSearchState {
  const [showPopover, setShowPopover] = useState(false);
  const [activeTracker, setActiveTracker] = useState<TorrentTrackerId>('nyaa');
  const [localState, setLocalState] = useState<TorrentSearchLocalState>(() =>
    createInitialLocalState(mediaId),
  );

  const state = localState.mediaId === mediaId
    ? localState
    : createInitialLocalState(mediaId);

  const updateLocalState = useCallback(
    (updater: (currentState: TorrentSearchLocalState) => TorrentSearchLocalState) => {
      setLocalState((previousState) => {
        const activeState = previousState.mediaId === mediaId
          ? previousState
          : createInitialLocalState(mediaId);
        return updater(activeState);
      });
    },
    [mediaId],
  );

  const nyaaSortBy = state.nyaaSortBy;
  const nyaaSortDirection = state.nyaaSortDirection;
  const nyaaPage = state.nyaaPage;

  const preferredAutoTracker: TorrentTrackerId =
    current?.remoteSource === 'jikan' ? 'nyaa' : 'iptorrents';

  const bestTorrentCacheMediaId =
    current?.remoteSource && current?.remoteSourceId
      ? `${current.remoteSource}:${current.remoteSourceId}`
      : mediaId;

  const preferredAutoTrackerLabel =
    preferredAutoTracker === 'nyaa' ? 'Nyaa' : 'IPTorrents';

  const findBestSeededTorrent = useCallback(
    async (tracker: TorrentTrackerId): Promise<BestSeededTorrentResult> => {
      const title = current?.title?.trim() ?? '';
      if (!title) {
        return { item: null, cached: false };
      }

      const titleKey = normalizeTitleKey(title);
      const cachedItem = loadCachedBestTorrent(
        tracker,
        bestTorrentCacheMediaId,
        titleKey,
      );
      if (cachedItem) {
        return { item: cachedItem, cached: true };
      }

      const response = tracker === 'nyaa'
        ? await searchNyaa(token, title, {
          limit: 32,
          page: 1,
          sortBy: 'seeders',
          sortDirection: 'desc',
        })
        : await searchIptorrents(token, title, {
          limit: 32,
          mediaType: current?.type === 'show' ? 'show' : 'movie',
        });

      const topSeeded = response.results
        .filter((item) => Boolean(item.downloadUrl))
        .reduce<BestSeededTorrentResult['item']>((best, item) => {
          if (!best) {
            return item;
          }

          return item.seeders > best.seeders ? item : best;
        }, null);

      if (topSeeded) {
        saveCachedBestTorrent(
          tracker,
          bestTorrentCacheMediaId,
          titleKey,
          topSeeded,
        );
      }

      return {
        item: topSeeded,
        cached: false,
      };
    },
    [bestTorrentCacheMediaId, current?.title, current?.type, token],
  );

  const startAutoBestSeededTorrent = useCallback(
    async (mode: AutoTorrentMode) => {
      if (!hasTorrentAccess || !current || state.autoTorrentPendingMode) {
        return;
      }

      const tracker = preferredAutoTracker;
      updateLocalState((currentState) => ({
        ...currentState,
        autoTorrentPendingMode: mode,
        autoTorrentError: null,
        autoTorrentStatus: `Finding top-seeded torrent on ${preferredAutoTrackerLabel}...`,
      }));

      try {
        const bestResult = await findBestSeededTorrent(tracker);
        if (!bestResult.item) {
          updateLocalState((currentState) => ({
            ...currentState,
            autoTorrentError: `No downloadable torrents were found on ${preferredAutoTrackerLabel} for this title.`,
            autoTorrentStatus: null,
          }));
          return;
        }

        updateLocalState((currentState) => ({
          ...currentState,
          autoTorrentStatus: bestResult.cached
            ? `Using cached top-seeded torrent from ${preferredAutoTrackerLabel}.`
            : `Starting top-seeded torrent from ${preferredAutoTrackerLabel}.`,
        }));

        if (tracker === 'nyaa') {
          if (mode === 'stream') {
            await nyaa.handleStartStream(bestResult.item);
          } else {
            await nyaa.handleStartDownload(bestResult.item);
          }
          return;
        }

        if (mode === 'stream') {
          await iptorrents.handleStartStream(bestResult.item);
        } else {
          await iptorrents.handleStartDownload(bestResult.item);
        }
      } catch (autoActionError) {
        updateLocalState((currentState) => ({
          ...currentState,
          autoTorrentError: toApiErrorMessage(
            autoActionError,
            `Failed to search ${preferredAutoTrackerLabel}.`,
          ),
          autoTorrentStatus: null,
        }));
      } finally {
        updateLocalState((currentState) => ({
          ...currentState,
          autoTorrentPendingMode: null,
        }));
      }
    },
    [
      current,
      findBestSeededTorrent,
      hasTorrentAccess,
      iptorrents,
      nyaa,
      preferredAutoTracker,
      preferredAutoTrackerLabel,
      state.autoTorrentPendingMode,
      updateLocalState,
    ],
  );

  useEffect(() => {
    if (
      !showPopover
      || activeTracker !== 'iptorrents'
      || iptorrents.searchRequested
    ) {
      return;
    }

    void iptorrents.requestSearch();
  }, [
    activeTracker,
    iptorrents,
    showPopover,
  ]);

  useEffect(() => {
    if (!showPopover || activeTracker !== 'nyaa') {
      return;
    }

    void nyaa.requestSearch({
      sortBy: nyaaSortBy,
      sortDirection: nyaaSortDirection,
      page: nyaaPage,
    });
  }, [
    activeTracker,
    nyaa,
    nyaaPage,
    nyaaSortBy,
    nyaaSortDirection,
    showPopover,
  ]);

  const activeTrackerOption =
    TORRENT_TRACKERS.find((tracker) => tracker.id === activeTracker)
    ?? TORRENT_TRACKERS[0];

  const trackerDescription = activeTrackerOption.id === 'iptorrents'
    ? 'Search IPTorrents and locally filter the returned names.'
    : 'Search Nyaa with source pagination and source-side sort ordering.';

  const showIptTrackerPanel = activeTrackerOption.id === 'iptorrents';

  const encodedTitleQuery = encodeURIComponent(current?.title?.trim() ?? '').replace(/%20/g, '+');
  const iptorrentsSearchUrl = `https://iptorrents.com/t?q=${encodedTitleQuery}&qf=ti#torrents`;
  const nyaaSearchUrl =
    `https://nyaa.si/?f=0&q=${encodedTitleQuery}`
    + `&s=${encodeURIComponent(nyaaSortBy)}&o=${encodeURIComponent(nyaaSortDirection)}`
    + `${nyaaPage > 1 ? `&p=${nyaaPage}` : ''}`;
  const resolvedNyaaPage = nyaa.searchResponse?.page ?? nyaaPage;
  const nyaaHasMore = nyaa.searchResponse?.hasMore ?? false;

  const preferredTrackerActionStatus =
    preferredAutoTracker === 'nyaa' ? nyaa.actionSuccess : iptorrents.actionSuccess;
  const preferredTrackerActionError =
    preferredAutoTracker === 'nyaa' ? nyaa.actionError : iptorrents.actionError;
  const heroAutoTorrentStatus = state.autoTorrentStatus ?? preferredTrackerActionStatus;
  const heroAutoTorrentError = state.autoTorrentError ?? preferredTrackerActionError;
  const heroAutoTorrentBusy = Boolean(
    state.autoTorrentPendingMode || iptorrents.pendingAction || nyaa.pendingAction,
  );

  const openPopover = useCallback(() => {
    if (!hasTorrentAccess) {
      return;
    }

    setActiveTracker('nyaa');
    setShowPopover(true);
  }, [hasTorrentAccess]);

  const closePopover = useCallback(() => {
    setShowPopover(false);
  }, []);

  const selectNyaaSort = useCallback((sortBy: NyaaSortField) => {
    updateLocalState((currentState) => ({
      ...currentState,
      nyaaSortBy: sortBy,
      nyaaPage: 1,
    }));
  }, [updateLocalState]);

  const toggleNyaaSortDirection = useCallback(() => {
    updateLocalState((currentState) => ({
      ...currentState,
      nyaaSortDirection: currentState.nyaaSortDirection === 'desc' ? 'asc' : 'desc',
      nyaaPage: 1,
    }));
  }, [updateLocalState]);

  const refreshNyaaSearch = useCallback(() => {
    void nyaa.requestSearch({
      force: true,
      sortBy: nyaaSortBy,
      sortDirection: nyaaSortDirection,
      page: nyaaPage,
    });
  }, [nyaa, nyaaPage, nyaaSortBy, nyaaSortDirection]);

  const goToPreviousNyaaPage = useCallback(() => {
    updateLocalState((currentState) => ({
      ...currentState,
      nyaaPage: Math.max(1, currentState.nyaaPage - 1),
    }));
  }, [updateLocalState]);

  const goToNextNyaaPage = useCallback(() => {
    updateLocalState((currentState) => ({
      ...currentState,
      nyaaPage: currentState.nyaaPage + 1,
    }));
  }, [updateLocalState]);

  const retryIptSearch = useCallback(() => {
    void iptorrents.requestSearch({ force: true });
  }, [iptorrents]);

  const retryNyaaSearch = useCallback(() => {
    void nyaa.requestSearch({
      force: true,
      sortBy: nyaaSortBy,
      sortDirection: nyaaSortDirection,
      page: nyaaPage,
    });
  }, [nyaa, nyaaPage, nyaaSortBy, nyaaSortDirection]);

  return useMemo(
    () => ({
      showPopover,
      activeTracker,
      preferredAutoTrackerLabel,
      autoTorrentPendingMode: state.autoTorrentPendingMode,
      heroAutoTorrentBusy,
      heroAutoTorrentStatus,
      heroAutoTorrentError,
      trackerDescription,
      showIptTrackerPanel,
      iptorrentsSearchUrl,
      nyaaSearchUrl,
      nyaaSortBy,
      nyaaSortDirection,
      resolvedNyaaPage,
      nyaaHasMore,
      openPopover,
      closePopover,
      setActiveTracker,
      selectNyaaSort,
      toggleNyaaSortDirection,
      refreshNyaaSearch,
      goToPreviousNyaaPage,
      goToNextNyaaPage,
      retryIptSearch,
      retryNyaaSearch,
      startAutoBestSeededTorrent,
    }),
    [
      activeTracker,
      closePopover,
      goToNextNyaaPage,
      goToPreviousNyaaPage,
      heroAutoTorrentBusy,
      heroAutoTorrentError,
      heroAutoTorrentStatus,
      iptorrentsSearchUrl,
      nyaaHasMore,
      nyaaSearchUrl,
      nyaaSortBy,
      nyaaSortDirection,
      openPopover,
      preferredAutoTrackerLabel,
      refreshNyaaSearch,
      resolvedNyaaPage,
      retryIptSearch,
      retryNyaaSearch,
      selectNyaaSort,
      setActiveTracker,
      showIptTrackerPanel,
      showPopover,
      state.autoTorrentPendingMode,
      startAutoBestSeededTorrent,
      toggleNyaaSortDirection,
      trackerDescription,
    ],
  );
}
