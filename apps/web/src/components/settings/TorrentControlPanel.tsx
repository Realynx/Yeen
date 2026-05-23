import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
} from '../../lib/api';
import type { TorrentItem, TorrentOrderMode } from '../../lib/types';

interface TorrentControlPanelProps {
  token: string;
  defaultOrderMode: TorrentOrderMode;
}

type TorrentPanelSectionId = 'addTorrent' | 'torrentLibrary';

interface TorrentPanelSectionProps {
  id: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function TorrentPanelSection({
  id,
  kicker,
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
}: TorrentPanelSectionProps) {
  const contentId = `${id}-content`;

  return (
    <section className={`settings-category${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="settings-category-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="settings-category-toggle-copy">
          <p className="settings-section-kicker">{kicker}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>

        <div className="settings-category-toggle-meta">
          {badge ? <span className="settings-pill">{badge}</span> : null}
          <span
            className={`settings-category-chevron${isOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          >
            v
          </span>
        </div>
      </button>

      {isOpen ? (
        <div id={contentId} className="settings-category-content">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function formatPercent(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

function formatRate(bytesPerSecond: number): string {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = Math.max(0, bytesPerSecond);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 8640000) {
    return '--';
  }

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return `${hours}h ${minutes}m`;
}

const TORRENT_STATE_LABELS: Record<string, string> = {
  error: 'Error',
  missingfiles: 'Missing Files',
  uploading: 'Seeding',
  pausedup: 'Seeding (Paused)',
  queuedup: 'Seeding (Queued)',
  stalledup: 'Seeding (Idle)',
  checkingup: 'Checking (Upload)',
  forcedup: 'Seeding (Forced)',
  allocating: 'Allocating',
  downloading: 'Downloading',
  metadl: 'Fetching Metadata',
  pauseddl: 'Downloading (Paused)',
  queueddl: 'Downloading (Queued)',
  stalleddl: 'Downloading (Stalled)',
  checkingdl: 'Checking (Download)',
  forceddl: 'Downloading (Forced)',
  checkingresumedata: 'Checking Resume Data',
  moving: 'Moving',
  unknown: 'Unknown',
};

function formatTorrentState(state: string): string {
  const normalizedState = state.trim().toLowerCase();
  if (!normalizedState) {
    return TORRENT_STATE_LABELS.unknown;
  }

  return TORRENT_STATE_LABELS[normalizedState] ?? state;
}

type TorrentStateCategoryKey =
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'queued'
  | 'checking'
  | 'moving'
  | 'error'
  | 'other';

const TORRENT_STATE_CATEGORY_LABELS: Record<TorrentStateCategoryKey, string> = {
  downloading: 'Downloading',
  seeding: 'Seeding',
  paused: 'Paused',
  queued: 'Queued',
  checking: 'Checking',
  moving: 'Moving',
  error: 'Issues',
  other: 'Other',
};

const TORRENT_STATE_CATEGORY_ORDER: TorrentStateCategoryKey[] = [
  'downloading',
  'seeding',
  'paused',
  'queued',
  'checking',
  'moving',
  'error',
  'other',
];

function categorizeTorrentState(state: string): TorrentStateCategoryKey {
  const normalizedState = state.trim().toLowerCase();

  if (!normalizedState) {
    return 'other';
  }

  if (normalizedState === 'error' || normalizedState === 'missingfiles') {
    return 'error';
  }

  if (normalizedState === 'moving') {
    return 'moving';
  }

  if (normalizedState.startsWith('checking')) {
    return 'checking';
  }

  if (normalizedState.startsWith('queued')) {
    return 'queued';
  }

  if (
    normalizedState.startsWith('paused') ||
    normalizedState.includes('stopped')
  ) {
    return 'paused';
  }

  if (
    normalizedState === 'uploading' ||
    normalizedState === 'stalledup' ||
    normalizedState === 'forcedup'
  ) {
    return 'seeding';
  }

  if (
    normalizedState === 'downloading' ||
    normalizedState === 'metadl' ||
    normalizedState === 'stalleddl' ||
    normalizedState === 'forceddl' ||
    normalizedState === 'allocating'
  ) {
    return 'downloading';
  }

  if (normalizedState.endsWith('up')) {
    return 'seeding';
  }

  if (normalizedState.endsWith('dl')) {
    return 'downloading';
  }

  return 'other';
}

interface TorrentStateCategoryGroup {
  key: TorrentStateCategoryKey;
  label: string;
  items: TorrentItem[];
}

type TorrentControlActionIconName =
  | 'selectVisible'
  | 'clear'
  | 'start'
  | 'stop'
  | 'restart'
  | 'sequential'
  | 'random'
  | 'delete';

function TorrentControlActionIcon({
  name,
}: {
  name: TorrentControlActionIconName;
}) {
  switch (name) {
    case 'selectVisible':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 12l3.2 3.2L17 8.5" />
        </svg>
      );
    case 'clear':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case 'start':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l10-6.5-10-6.5z" className="torrent-control-action-icon-fill" />
        </svg>
      );
    case 'stop':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" className="torrent-control-action-icon-fill" />
        </svg>
      );
    case 'restart':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
      );
    case 'sequential':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h9M4 12h9M4 18h9" />
          <path d="M17 7v10m0 0-3-3m3 3 3-3" />
        </svg>
      );
    case 'random':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h4l10 10h2" />
          <path d="M18 5l3 2-3 2" />
          <path d="M4 17h4l2-2" />
          <path d="M18 15l3 2-3 2" />
        </svg>
      );
    case 'delete':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l1 12h6l1-12" />
          <path d="M10.5 10.5v6M13.5 10.5v6" />
        </svg>
      );
    default:
      return null;
  }
}

export function TorrentControlPanel({
  token,
  defaultOrderMode,
}: TorrentControlPanelProps) {
  const [items, setItems] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [magnetLink, setMagnetLink] = useState('');
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedHashes, setSelectedHashes] = useState<string[]>([]);
  const [selectionAnchorHash, setSelectionAnchorHash] = useState<string | null>(
    null,
  );
  const [hiddenCategories, setHiddenCategories] = useState<
    Partial<Record<TorrentStateCategoryKey, boolean>>
  >({});
  const [expandedSections, setExpandedSections] = useState<
    Record<TorrentPanelSectionId, boolean>
  >({
    addTorrent: true,
    torrentLibrary: true,
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchActive = normalizedSearchQuery.length > 0;

  const filteredItems = useMemo(() => {
    if (!searchActive) {
      return items;
    }

    return items.filter((item) => {
      const haystack = `${item.name}\n${item.hash}\n${formatTorrentState(item.state)}\n${item.state}`
        .toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [items, normalizedSearchQuery, searchActive]);

  const categorizedItems = useMemo<TorrentStateCategoryGroup[]>(() => {
    const groupedByCategory: Record<TorrentStateCategoryKey, TorrentItem[]> = {
      downloading: [],
      seeding: [],
      paused: [],
      queued: [],
      checking: [],
      moving: [],
      error: [],
      other: [],
    };

    for (const item of filteredItems) {
      const categoryKey = categorizeTorrentState(item.state);
      groupedByCategory[categoryKey].push(item);
    }

    return TORRENT_STATE_CATEGORY_ORDER.map((key) => ({
      key,
      label: TORRENT_STATE_CATEGORY_LABELS[key],
      items: groupedByCategory[key],
    })).filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const toggleCategory = useCallback((key: TorrentStateCategoryKey) => {
    setHiddenCategories((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const selectedHashSet = useMemo(() => new Set(selectedHashes), [selectedHashes]);

  const visibleHashes = useMemo(
    () =>
      categorizedItems
        .filter((group) => searchActive || !(hiddenCategories[group.key] ?? true))
        .flatMap((group) => group.items.map((item) => item.hash)),
    [categorizedItems, hiddenCategories, searchActive],
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleHashes.length > 0 &&
      visibleHashes.every((hash) => selectedHashSet.has(hash)),
    [visibleHashes, selectedHashSet],
  );

  const selectedCount = selectedHashes.length;
  const hasSelection = selectedCount > 0;
  const isBusy = actionKey !== null;

  const totalTorrentCount = items.length;
  const filteredTorrentCount = filteredItems.length;
  const groupCount = categorizedItems.length;

  function togglePanelSection(section: TorrentPanelSectionId) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  const toggleSelection = useCallback((hash: string, shiftKey = false) => {
    setSelectedHashes((previous) => {
      const nextSet = new Set(previous);
      const shouldSelect = !nextSet.has(hash);

      if (shiftKey && selectionAnchorHash && selectionAnchorHash !== hash) {
        const anchorIndex = visibleHashes.indexOf(selectionAnchorHash);
        const targetIndex = visibleHashes.indexOf(hash);

        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [rangeStart, rangeEnd] =
            anchorIndex < targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex];
          const range = visibleHashes.slice(rangeStart, rangeEnd + 1);

          if (shouldSelect) {
            for (const rangeHash of range) {
              nextSet.add(rangeHash);
            }
          } else {
            for (const rangeHash of range) {
              nextSet.delete(rangeHash);
            }
          }

          return Array.from(nextSet);
        }
      }

      if (shouldSelect) {
        nextSet.add(hash);
      } else {
        nextSet.delete(hash);
      }

      return Array.from(nextSet);
    });
    setSelectionAnchorHash(hash);
  }, [selectionAnchorHash, visibleHashes]);

  const toggleVisibleSelection = useCallback(() => {
    if (visibleHashes.length === 0) {
      return;
    }

    setSelectedHashes((previous) => {
      const previousSet = new Set(previous);
      const visibleHashSet = new Set(visibleHashes);
      const everyVisibleSelected = visibleHashes.every((hash) =>
        previousSet.has(hash),
      );

      if (everyVisibleSelected) {
        return previous.filter((hash) => !visibleHashSet.has(hash));
      }

      for (const hash of visibleHashes) {
        previousSet.add(hash);
      }

      return Array.from(previousSet);
    });
  }, [visibleHashes]);

  const clearSelection = useCallback(() => {
    setSelectedHashes([]);
    setSelectionAnchorHash(null);
  }, []);

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
    void loadTorrents();
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

  useEffect(() => {
    const validHashes = new Set(items.map((item) => item.hash));
    setSelectedHashes((previous) => {
      const next = previous.filter((hash) => validHashes.has(hash));
      return next.length === previous.length ? previous : next;
    });
    setSelectionAnchorHash((previous) =>
      previous && validHashes.has(previous) ? previous : null,
    );
  }, [items]);

  async function runSelectedAction(
    key: string,
    action: (hash: string) => Promise<{ message?: string }>,
    successPrefix: string,
    options?: { clearSelection?: boolean },
  ) {
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
        setSelectedHashes((previous) =>
          previous.filter((hash) => !hashes.includes(hash)),
        );
      }

      await loadTorrents(true);
    } catch (actionFailure) {
      setError(toApiErrorMessage(actionFailure, 'Torrent action failed.'));
    } finally {
      setActionKey(null);
    }
  }

  const handlePickedTorrentFile = useCallback((nextFile: File | null) => {
    if (!nextFile) {
      return;
    }

    const normalizedFileName = nextFile.name.trim().toLowerCase();
    const isTorrentFile =
      nextFile.type === 'application/x-bittorrent' ||
      normalizedFileName.endsWith('.torrent');

    if (!isTorrentFile) {
      setError('Only .torrent files are supported for upload.');
      return;
    }

    setError(null);
    setTorrentFile(nextFile);
    setMagnetLink('');
  }, []);

  const handleDropZoneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!isDropTargetActive) {
        setIsDropTargetActive(true);
      }
    },
    [isDropTargetActive],
  );

  const handleDropZoneDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDropTargetActive(false);
      const nextFile = event.dataTransfer.files?.[0] ?? null;
      handlePickedTorrentFile(nextFile);
    },
    [handlePickedTorrentFile],
  );

  const handleMagnetLinkChange = useCallback(
    (value: string) => {
      setMagnetLink(value);

      if (value.trim() && torrentFile) {
        setTorrentFile(null);
        setFileInputKey((previous) => previous + 1);
      }
    },
    [torrentFile],
  );

  async function handleAddTorrent(event: FormEvent<HTMLFormElement>) {
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
      setMagnetLink('');
      setTorrentFile(null);
      setFileInputKey((previous) => previous + 1);
      await loadTorrents(true);
    } catch (addFailure) {
      setError(toApiErrorMessage(addFailure, 'Failed to add torrent.'));
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSelected() {
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
  }

  return (
    <article className="settings-surface settings-surface-full settings-surface-categorized">
      <header className="settings-surface-header torrent-control-title-panel">
        <div className="torrent-control-title-copy">
          <p className="settings-section-kicker">Download Control</p>
          <h2>qBittorrent</h2>
        </div>
        <span className="settings-pill torrent-control-title-pill">Categorized Controls</span>
      </header>

      <p className="muted torrent-control-title-description">
        Add, start, stop, restart, and delete torrents. Intake is simplified to
        magnet or .torrent file, and new torrents always start immediately.
      </p>

      <p className="settings-inline-meta torrent-control-title-meta">
        Default add mode is <strong>{defaultOrderMode}</strong>. Use status groups to focus queue operations.
      </p>

      <div className="settings-categories torrent-control-categories">
        <TorrentPanelSection
          id="download-add-torrent"
          kicker="Downloads"
          title="Add Torrent"
          description="Submit a magnet link or drag and drop a .torrent file."
          badge="Intake"
          isOpen={expandedSections.addTorrent}
          onToggle={() => togglePanelSection('addTorrent')}
        >
          <form className="system-settings-form" onSubmit={handleAddTorrent}>
            <div className="settings-field settings-field-wide torrent-control-intake-field">
              <span className="settings-field-label">Magnet Link or Torrent File</span>

              <div
                className={`torrent-control-intake-shell${isDropTargetActive ? ' is-drop-active' : ''}`}
                onDragEnter={() => setIsDropTargetActive(true)}
                onDragLeave={(event) => {
                  const relatedTarget = event.relatedTarget as Node | null;
                  if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                    return;
                  }

                  setIsDropTargetActive(false);
                }}
                onDragOver={handleDropZoneDragOver}
                onDrop={handleDropZoneDrop}
              >
                <input
                  type="text"
                  value={magnetLink}
                  onChange={(event) => handleMagnetLinkChange(event.target.value)}
                  placeholder="Paste magnet:?xt=urn:btih:..."
                />

                <div className="torrent-control-intake-divider" aria-hidden="true">
                  or
                </div>

                <div className="torrent-control-drop-zone">
                  <input
                    ref={fileInputRef}
                    key={fileInputKey}
                    type="file"
                    accept=".torrent,application/x-bittorrent"
                    className="torrent-control-file-input-hidden"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      handlePickedTorrentFile(nextFile);
                    }}
                  />

                  <p className="torrent-control-drop-copy">
                    {torrentFile
                      ? `Selected file: ${torrentFile.name}`
                      : 'Drag and drop a .torrent file here.'}
                  </p>

                  <div className="settings-actions-row torrent-control-drop-actions">
                    <button
                      type="button"
                      className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy || adding}
                    >
                      Choose File
                    </button>

                    {torrentFile ? (
                      <button
                        type="button"
                        className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                        onClick={() => {
                          setTorrentFile(null);
                          setFileInputKey((previous) => previous + 1);
                        }}
                        disabled={isBusy || adding}
                      >
                        Clear File
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <small className="settings-field-hint">
                Use a magnet link or a torrent file. New torrents always start
                immediately on the host.
              </small>
            </div>

            <div className="system-settings-footer">
              <p className="muted">
                New torrents use your default order mode: {defaultOrderMode}.
              </p>
              <div className="settings-actions-row">
                <button
                  type="button"
                  className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  onClick={() => void loadTorrents(true)}
                  disabled={loading || refreshing || adding || Boolean(actionKey)}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>

                <button
                  type="submit"
                  className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  disabled={adding || loading || Boolean(actionKey)}
                >
                  {adding ? 'Adding...' : 'Add Torrent'}
                </button>
              </div>
            </div>
          </form>
        </TorrentPanelSection>

        <TorrentPanelSection
          id="download-torrent-library"
          kicker="Torrent Library"
          title="Torrents By Status"
          description="Search torrents, run batch controls, and expand status groups when needed."
          badge={`${filteredTorrentCount} shown / ${totalTorrentCount} torrents / ${groupCount} groups`}
          isOpen={expandedSections.torrentLibrary}
          onToggle={() => togglePanelSection('torrentLibrary')}
        >
          {loading ? <p className="muted">Loading torrents...</p> : null}

          {!loading && items.length === 0 ? (
            <p className="muted">No torrents reported by qBittorrent.</p>
          ) : null}

          {!loading && items.length > 0 ? (
            <section className="torrent-control-toolbar" aria-label="Torrent library controls">
              <div className="torrent-control-toolbar-head">
                <p className="torrent-control-selection-summary">
                  Selected {selectedCount} of {filteredTorrentCount} shown ({totalTorrentCount} total)
                </p>
                <p className="torrent-control-selection-hint muted">
                  Click a row to select. Shift+click selects a range.
                </p>
              </div>

              <label className="settings-field settings-field-wide torrent-control-search-field">
                <span className="settings-field-label">Search Torrents</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, hash, or status"
                />
              </label>

              <div className="settings-actions-row torrent-control-selection-actions">
                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={toggleVisibleSelection}
                  disabled={isBusy || adding || visibleHashes.length === 0}
                >
                  <TorrentControlActionIcon
                    name={allVisibleSelected ? 'clear' : 'selectVisible'}
                  />
                  <span>{allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={clearSelection}
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="clear" />
                  <span>Clear Selection</span>
                </button>
              </div>

              <div className="settings-actions-row torrent-control-batch-actions">
                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() =>
                    void runSelectedAction(
                      'start:selected',
                      (hash) => startTorrent(token, hash),
                      'Started',
                    )
                  }
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="start" />
                  <span>Start</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() =>
                    void runSelectedAction(
                      'stop:selected',
                      (hash) => stopTorrent(token, hash),
                      'Stopped',
                    )
                  }
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="stop" />
                  <span>Stop</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() =>
                    void runSelectedAction(
                      'restart:selected',
                      (hash) => restartTorrent(token, hash),
                      'Restarted',
                    )
                  }
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="restart" />
                  <span>Restart</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() =>
                    void runSelectedAction(
                      'mode:sequential:selected',
                      (hash) => setTorrentOrderMode(token, hash, 'sequential'),
                      'Switched to sequential mode for',
                    )
                  }
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="sequential" />
                  <span>In Order</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() =>
                    void runSelectedAction(
                      'mode:random:selected',
                      (hash) => setTorrentOrderMode(token, hash, 'random'),
                      'Switched to random mode for',
                    )
                  }
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="random" />
                  <span>Random</span>
                </button>

                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() => void handleDeleteSelected()}
                  disabled={isBusy || adding || !hasSelection}
                >
                  <TorrentControlActionIcon name="delete" />
                  <span>Delete</span>
                </button>
              </div>
            </section>
          ) : null}

          {!loading && items.length > 0 && filteredTorrentCount === 0 ? (
            <p className="muted torrent-control-empty-search">
              No torrents match "{searchQuery.trim()}".
            </p>
          ) : null}

          {!loading && filteredTorrentCount > 0 ? (
            <div className="torrent-control-groups">
              {categorizedItems.map((group) => {
                const hidden = searchActive ? false : (hiddenCategories[group.key] ?? true);

                return (
                  <section key={group.key} className="torrent-control-group">
                    <header className="torrent-control-group-header">
                      <h3 className="torrent-control-group-title">
                        <button
                          type="button"
                          className="torrent-control-group-title-button"
                          onClick={() => toggleCategory(group.key)}
                          aria-expanded={!hidden}
                          aria-label={`${hidden ? 'Show' : 'Hide'} ${group.label} torrents`}
                        >
                          <span
                            className={`torrent-control-group-chevron${hidden ? ' is-hidden' : ''}`}
                            aria-hidden="true"
                          >
                            ▾
                          </span>
                          <span>{group.label}</span>
                          <span className="torrent-control-group-count">{group.items.length}</span>
                        </button>
                      </h3>
                    </header>

                    {hidden ? (
                      <p className="muted torrent-control-group-hidden-note">Rows hidden.</p>
                    ) : (
                      <ul className="settings-location-list torrent-control-list">
                        {group.items.map((item) => {
                          const progressPercent = formatPercent(item.progress);
                          const modeLabel =
                            item.sequentialDownload === null
                              ? 'Unknown'
                              : item.sequentialDownload
                                ? 'Sequential'
                                : 'Random';
                          const selected = selectedHashSet.has(item.hash);

                          return (
                            <li
                              key={item.hash}
                              className={`settings-location-item torrent-control-item${selected ? ' is-selected' : ''}`}
                              onClick={(event) => {
                                if (isBusy || adding) {
                                  return;
                                }

                                const target = event.target as HTMLElement;
                                if (target.closest('input,button,a,label')) {
                                  return;
                                }

                                toggleSelection(item.hash, event.shiftKey);
                              }}
                            >
                              <label className="torrent-control-item-select">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(event) => {
                                    const shiftKey = (
                                      event.nativeEvent as MouseEvent
                                    ).shiftKey;
                                    toggleSelection(item.hash, shiftKey);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  disabled={isBusy || adding}
                                  aria-label={`Select torrent ${item.name}`}
                                />
                              </label>

                              <div className="settings-location-text torrent-control-item-text">
                                <div className="torrent-control-item-heading">
                                  <strong>{item.name}</strong>
                                  <span
                                    className="torrent-control-item-state"
                                    title={`Raw state: ${item.state}`}
                                  >
                                    {formatTorrentState(item.state)}
                                  </span>
                                </div>

                                <div className="settings-inline-meta torrent-control-item-meta">
                                  <span className="torrent-control-meta-chip">{progressPercent}</span>
                                  <span className="torrent-control-meta-chip">
                                    {formatBytes(item.completedBytes)} / {formatBytes(item.sizeBytes)}
                                  </span>
                                  <span className="torrent-control-meta-chip">
                                    ETA {formatEta(item.etaSeconds)}
                                  </span>
                                  <span className="torrent-control-meta-chip">
                                    Down {formatRate(item.downloadRate)}
                                  </span>
                                  <span className="torrent-control-meta-chip">
                                    Up {formatRate(item.uploadRate)}
                                  </span>
                                  <span className="torrent-control-meta-chip">Mode {modeLabel}</span>
                                </div>

                                <div
                                  className="settings-scan-progress-bar"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Math.round(item.progress * 100)}
                                >
                                  <div style={{ width: progressPercent }} />
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          ) : null}
        </TorrentPanelSection>
      </div>

      {message ? <p className="scan-success">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </article>
  );
}
