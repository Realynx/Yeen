import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addTorrent,
  deleteTorrent,
  listTorrents,
  restartTorrent,
  setTorrentOrderMode,
  startTorrent,
  stopTorrent,
  toApiErrorMessage,
} from '../../../shared/services/api';
import type { TorrentItem } from '../../../shared/services/types';
import { useTorrentControlIntakeState } from './useTorrentControlIntakeState';
import { useTorrentControlSelectionState } from './useTorrentControlSelectionState';

export function useTorrentControlState({ token }: { token: string }) {
  const [items, setItems] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    magnetLink,
    torrentFile,
    fileInputRef,
    fileInputKey,
    isDropTargetActive,
    handleMagnetLinkChange,
    handleDragEnter,
    handleDragLeave,
    handleDropZoneDragOver,
    handleDropZoneDrop,
    handlePickedTorrentFile,
    handleClearFile,
    resetIntake,
  } = useTorrentControlIntakeState({ setError });

  const {
    searchQuery,
    searchActive,
    selectedHashes,
    hasSelection,
    selectedCount,
    filteredTorrentCount,
    totalTorrentCount,
    groupCount,
    visibleHashesLength,
    allVisibleSelected,
    categorizedItems,
    hiddenCategories,
    selectedHashSet,
    expandedSections,
    togglePanelSection,
    toggleCategory,
    setSearchQuery,
    toggleVisibleSelection,
    clearSelection,
    toggleSelection,
    removeHashesFromSelection,
  } = useTorrentControlSelectionState({ items });

  const isBusy = actionKey !== null;

  const hasActiveDownloads = useMemo(
    () =>
      items.some((item) => {
        const normalizedState = item.state.toLowerCase();
        const incomplete = item.progress < 1;
        const pausedState =
          normalizedState.includes('paused') || normalizedState.includes('stopped');
        return incomplete && !pausedState;
      }),
    [items],
  );

  const loadTorrents = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await listTorrents(token);
        setItems(response.items);
      } catch (loadFailure) {
        setError(toApiErrorMessage(loadFailure, 'Failed to load torrents.'));
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void loadTorrents();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadTorrents]);

  useEffect(() => {
    if (!hasActiveDownloads) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadTorrents(true);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveDownloads, loadTorrents]);

  const runSelectedAction = useCallback(
    async (
      key: string,
      action: (hash: string) => Promise<{ message?: string }>,
      successPrefix: string,
      options?: { clearSelection?: boolean },
    ) => {
      if (!selectedHashes.length) {
        setError('Select at least one torrent first.');
        return;
      }

      const hashes = [...selectedHashes];

      setActionKey(key);
      setError(null);
      setMessage(null);

      try {
        const results = await Promise.allSettled(
          hashes.map((hash) => action(hash)),
        );
        const successCount = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        const failureCount = hashes.length - successCount;

        if (successCount > 0) {
          setMessage(
            failureCount > 0
              ? `${successPrefix} ${successCount} torrent${successCount === 1 ? '' : 's'}. ${failureCount} failed.`
              : `${successPrefix} ${successCount} torrent${successCount === 1 ? '' : 's'}.`,
          );
        }

        if (failureCount > 0) {
          const firstFailure = results.find(
            (result) => result.status === 'rejected',
          );
          const failureReason =
            firstFailure && firstFailure.status === 'rejected'
              ? toApiErrorMessage(firstFailure.reason, 'Torrent action failed.')
              : 'Torrent action failed.';

          setError(
            `${failureCount} torrent${failureCount === 1 ? '' : 's'} failed. ${failureReason}`,
          );
        }

        if (options?.clearSelection) {
          removeHashesFromSelection(hashes);
        }

        await loadTorrents(true);
      } catch (actionFailure) {
        setError(toApiErrorMessage(actionFailure, 'Torrent action failed.'));
      } finally {
        setActionKey(null);
      }
    },
    [loadTorrents, removeHashesFromSelection, selectedHashes],
  );

  const handleAddTorrent = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const normalizedMagnet = magnetLink.trim();
      if (!normalizedMagnet && !torrentFile) {
        setError('Provide a magnet link or a .torrent file.');
        return;
      }

      setAdding(true);
      setError(null);
      setMessage(null);

      try {
        const response = await addTorrent(token, {
          magnetLink: normalizedMagnet || undefined,
          paused: false,
          torrentFile,
        });

        setMessage(
          `Torrent added and started. Order mode: ${response.orderMode === 'sequential' ? 'Sequential' : 'Random'}.`,
        );
        resetIntake();
        await loadTorrents(true);
      } catch (addFailure) {
        setError(toApiErrorMessage(addFailure, 'Failed to add torrent.'));
      } finally {
        setAdding(false);
      }
    },
    [loadTorrents, magnetLink, resetIntake, token, torrentFile],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedHashes.length) {
      setError('Select at least one torrent first.');
      return;
    }

    const choice = window.prompt(
      'Type "keep" to remove only the torrent, or "files" to remove torrent and downloaded files.',
      'keep',
    );

    if (choice === null) {
      return;
    }

    const normalizedChoice = choice.trim().toLowerCase();
    if (normalizedChoice !== 'keep' && normalizedChoice !== 'files') {
      setError('Delete cancelled. Use "keep" or "files" when prompted.');
      return;
    }

    const deleteFiles = normalizedChoice === 'files';
    const confirmed = window.confirm(
      deleteFiles
        ? `Delete ${selectedHashes.length} selected torrent${selectedHashes.length === 1 ? '' : 's'} and downloaded files permanently?`
        : `Delete ${selectedHashes.length} selected torrent${selectedHashes.length === 1 ? '' : 's'} and keep files on disk?`,
    );

    if (!confirmed) {
      return;
    }

    await runSelectedAction(
      `delete:selected:${deleteFiles ? 'files' : 'keep'}`,
      (hash) => deleteTorrent(token, hash, deleteFiles),
      deleteFiles ? 'Deleted (with files) for' : 'Deleted for',
      { clearSelection: true },
    );
  }, [runSelectedAction, selectedHashes, token]);

  const handleRefresh = useCallback(() => {
    void loadTorrents(true);
  }, [loadTorrents]);

  const handleStartSelected = useCallback(() => {
    void runSelectedAction('start:selected', (hash) => startTorrent(token, hash), 'Started');
  }, [runSelectedAction, token]);

  const handleStopSelected = useCallback(() => {
    void runSelectedAction('stop:selected', (hash) => stopTorrent(token, hash), 'Stopped');
  }, [runSelectedAction, token]);

  const handleRestartSelected = useCallback(() => {
    void runSelectedAction('restart:selected', (hash) => restartTorrent(token, hash), 'Restarted');
  }, [runSelectedAction, token]);

  const handleSequentialSelected = useCallback(() => {
    void runSelectedAction(
      'mode:sequential:selected',
      (hash) => setTorrentOrderMode(token, hash, 'sequential'),
      'Switched to sequential mode for',
    );
  }, [runSelectedAction, token]);

  const handleRandomSelected = useCallback(() => {
    void runSelectedAction(
      'mode:random:selected',
      (hash) => setTorrentOrderMode(token, hash, 'random'),
      'Switched to random mode for',
    );
  }, [runSelectedAction, token]);

  return {
    loading,
    refreshing,
    adding,
    isBusy,
    message,
    error,
    magnetLink,
    torrentFile,
    fileInputRef,
    fileInputKey,
    isDropTargetActive,
    searchQuery,
    searchActive,
    hasSelection,
    selectedCount,
    filteredTorrentCount,
    totalTorrentCount,
    groupCount,
    visibleHashesLength,
    allVisibleSelected,
    categorizedItems,
    hiddenCategories,
    selectedHashSet,
    expandedSections,
    togglePanelSection,
    toggleCategory,
    setSearchQuery,
    toggleVisibleSelection,
    clearSelection,
    handleStartSelected,
    handleStopSelected,
    handleRestartSelected,
    handleSequentialSelected,
    handleRandomSelected,
    handleDeleteSelected,
    toggleSelection,
    handleMagnetLinkChange,
    handleDragEnter,
    handleDragLeave,
    handleDropZoneDragOver,
    handleDropZoneDrop,
    handlePickedTorrentFile,
    handleClearFile,
    handleRefresh,
    handleAddTorrent,
  };
}
