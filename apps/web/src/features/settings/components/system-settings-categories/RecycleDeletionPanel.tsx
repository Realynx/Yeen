import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listRecycleDeletions,
  purgeRecycleDeletions,
  toApiErrorMessage,
} from '../../../shared/services/api';
import { formatBytes } from '../../../shared/services/formatters';
import type { RecycleDeletionEntry } from '../../../shared/services/types';

interface RecycleDeletionPanelProps {
  token: string;
  disabled?: boolean;
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
}

function RecycleDeletionList({
  entries,
  selectedPaths,
  busy,
  loading,
  onToggle,
}: {
  entries: RecycleDeletionEntry[];
  selectedPaths: Set<string>;
  busy: boolean;
  loading: boolean;
  onToggle: (path: string, checked: boolean) => void;
}) {
  if (loading) return <p className="muted" style={{ marginTop: '0.6rem' }}>Loading recycle operations...</p>;
  if (entries.length === 0) return <p className="muted" style={{ marginTop: '0.6rem' }}>No recycle operation folders found.</p>;
  return (
    <div className="recycle-deletion-list" role="list">
      {entries.map((entry) => {
        const checked = selectedPaths.has(entry.folderPath);
        return (
          <label key={entry.folderPath} className={checked ? 'recycle-deletion-item is-selected' : 'recycle-deletion-item'}>
            <input type="checkbox" checked={checked}
              onChange={(event) => onToggle(entry.folderPath, event.target.checked)} disabled={busy} />
            <div className="recycle-deletion-item-copy">
              <div className="recycle-deletion-item-head">
                <code>{entry.operationId}</code>
                <span>{formatBytes(entry.sizeBytes)} · {entry.fileCount} file{entry.fileCount === 1 ? '' : 's'}</span>
              </div>
              <p className="recycle-deletion-item-meta">{entry.driveRoot} · updated {formatTimestamp(entry.updatedAt)}</p>
              <p className="recycle-deletion-item-path">{entry.folderPath}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function RecycleSummary({ totalEntries, totalSizeBytes, selectedCount, selectedSizeBytes, truncated }: {
  totalEntries: number; totalSizeBytes: number; selectedCount: number;
  selectedSizeBytes: number; truncated: boolean;
}) {
  return (
    <div className="recycle-deletion-summary">
      <span>{totalEntries} operation(s)</span><span>{formatBytes(totalSizeBytes)} total</span>
      {selectedCount > 0 ? <span>{selectedCount} selected ({formatBytes(selectedSizeBytes)})</span> : null}
      {truncated ? <span>showing latest 300</span> : null}
    </div>
  );
}

export function RecycleDeletionPanel({
  token,
  disabled = false,
}: RecycleDeletionPanelProps) {
  const [entries, setEntries] = useState<RecycleDeletionEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [olderThanDays, setOlderThanDays] = useState('30');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = disabled || loading || purging;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listRecycleDeletions(token, 300);
      setEntries(result.entries);
      setTotalEntries(result.totalEntries);
      setTotalSizeBytes(result.totalSizeBytes);
      setTruncated(result.truncated);

      setSelectedPaths((previous) => {
        const visiblePaths = new Set(result.entries.map((entry) => entry.folderPath));
        const next = new Set<string>();
        for (const selectedPath of previous) {
          if (visiblePaths.has(selectedPath)) {
            next.add(selectedPath);
          }
        }
        return next;
      });
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to load recycle folders.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  function toggleSelected(folderPath: string, checked: boolean) {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(folderPath);
      } else {
        next.delete(folderPath);
      }
      return next;
    });
  }

  const selectedCount = selectedPaths.size;
  const selectedSizeBytes = useMemo(() => {
    if (selectedPaths.size === 0) {
      return 0;
    }

    return entries.reduce((sum, entry) => {
      if (selectedPaths.has(entry.folderPath)) {
        return sum + entry.sizeBytes;
      }
      return sum;
    }, 0);
  }, [entries, selectedPaths]);

  async function handlePurgeSelected() {
    if (selectedCount === 0) {
      return;
    }

    if (
      !window.confirm(
        `Purge ${selectedCount} selected recycle operation folder(s)?`,
      )
    ) {
      return;
    }

    setPurging(true);
    setError(null);
    setMessage(null);

    try {
      const result = await purgeRecycleDeletions(token, {
        operationPaths: [...selectedPaths],
      });
      setMessage(result.message);
      setSelectedPaths(new Set());
      await refresh();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to purge selected recycle folders.'));
    } finally {
      setPurging(false);
    }
  }

  async function handlePurgeOlderThan() {
    const parsedDays = Number.parseInt(olderThanDays.trim(), 10);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      setError('Enter a valid day count greater than zero.');
      return;
    }

    if (
      !window.confirm(
        `Purge recycle operation folders older than ${parsedDays} day(s)?`,
      )
    ) {
      return;
    }

    setPurging(true);
    setError(null);
    setMessage(null);

    try {
      const result = await purgeRecycleDeletions(token, {
        olderThanDays: parsedDays,
      });
      setMessage(result.message);
      setSelectedPaths(new Set());
      await refresh();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to purge old recycle folders.'));
    } finally {
      setPurging(false);
    }
  }

  async function handlePurgeAll() {
    if (
      !window.confirm(
        'Purge all recycle operation folders on configured drives? This cannot be undone.',
      )
    ) {
      return;
    }

    setPurging(true);
    setError(null);
    setMessage(null);

    try {
      const result = await purgeRecycleDeletions(token, {
        purgeAll: true,
      });
      setMessage(result.message);
      setSelectedPaths(new Set());
      await refresh();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to purge all recycle folders.'));
    } finally {
      setPurging(false);
    }
  }

  return (
    <section className="recycle-deletion-panel">
      <div className="commit-subheader recycle-deletion-subheader">
        <div>
          <p className="settings-section-kicker">Deletion Recycle</p>
          <h4>Browse & Purge Recycle Folders</h4>
        </div>
        <button
          type="button"
          className="ghost-button small !rounded-lg !px-3 !py-1.5"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <p className="muted recycle-deletion-copy">
        Deleted media files are stored on their original drives under
        .yeen-recycle/media-deletions. Use this panel to review and clean old
        folders.
      </p>

      <RecycleSummary totalEntries={totalEntries} totalSizeBytes={totalSizeBytes}
        selectedCount={selectedCount} selectedSizeBytes={selectedSizeBytes} truncated={truncated} />

      <div className="recycle-deletion-toolbar">
        <label className="recycle-deletion-days-input" htmlFor="recycle-days-input">
          <span>Older than (days)</span>
          <input
            id="recycle-days-input"
            type="number"
            min={1}
            step={1}
            value={olderThanDays}
            onChange={(event) => setOlderThanDays(event.target.value)}
            disabled={busy}
          />
        </label>

        <button
          type="button"
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          onClick={() => void handlePurgeOlderThan()}
          disabled={busy}
        >
          {purging ? 'Purging...' : 'Purge Older'}
        </button>

        <button
          type="button"
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          onClick={() => void handlePurgeSelected()}
          disabled={busy || selectedCount === 0}
        >
          {purging ? 'Purging...' : `Purge Selected (${selectedCount})`}
        </button>

        <button
          type="button"
          className="danger-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          onClick={() => void handlePurgeAll()}
          disabled={busy || totalEntries === 0}
        >
          {purging ? 'Purging...' : 'Purge All'}
        </button>
      </div>

      {message || error ? (
        <div className="commit-status-row" aria-live="polite">
          {message ? <p className="commit-status commit-status-ok">{message}</p> : null}
          {error ? <p className="commit-status commit-status-error">{error}</p> : null}
        </div>
      ) : null}

      <RecycleDeletionList entries={entries} selectedPaths={selectedPaths} busy={busy}
        loading={loading} onToggle={toggleSelected} />
    </section>
  );
}
