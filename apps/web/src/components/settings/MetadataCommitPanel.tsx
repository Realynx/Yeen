import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  CommitApplyResponse,
  CommitChainRollbackResponse,
  CommitHistoryEntry,
  CommitPlanResponse,
} from '../../lib/api';
import {
  applyMetadataCommit,
  exportMediaMetadata,
  importMediaMetadata,
  listMetadataCommitHistory,
  planMetadataCommit,
  rollbackMetadataCommit,
  rollbackToMetadataCommit,
  toApiErrorMessage,
} from '../../lib/api';

interface MetadataCommitPanelProps {
  token: string;
  embedded?: boolean;
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function relativeName(path: string): string {
  const parts = path.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last || path;
}

function triggerJsonDownload(payload: unknown, exportedAt: string): string {
  const safeStamp = exportedAt.replace(/[:.]/g, '-');
  const fileName = `yeen-metadata-${safeStamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return fileName;
}

export function MetadataCommitPanel({
  token,
  embedded = false,
}: MetadataCommitPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [plan, setPlan] = useState<CommitPlanResponse | null>(null);
  const [report, setReport] = useState<CommitApplyResponse | null>(null);
  const [history, setHistory] = useState<CommitHistoryEntry[]>([]);
  const [writeNfo, setWriteNfo] = useState(true);
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollingBackToId, setRollingBackToId] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<CommitChainRollbackResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const result = await listMetadataCommitHistory(token);
      setHistory(result);
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to load commit history.'));
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handlePlan() {
    setPlanning(true);
    setError(null);
    setMessage(null);
    setReport(null);
    try {
      const result = await planMetadataCommit(token);
      setPlan(result);
      if (result.summary.movableItems === 0) {
        setMessage(
          'Nothing to commit — all media files already match the target structure.',
        );
      }
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to build commit plan.'));
    } finally {
      setPlanning(false);
    }
  }

  async function handleCommit() {
    if (!plan || plan.summary.movableItems === 0) return;
    const confirmText =
      `This will rename ${plan.summary.movableItems} file(s)` +
      (plan.summary.sidecars > 0
        ? ` plus ${plan.summary.sidecars} sidecar(s)`
        : '') +
      ` on disk. A rollback entry will be created. Continue?`;
    if (!window.confirm(confirmText)) return;

    setCommitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await applyMetadataCommit(token, { writeNfo });
      setReport(result);
      setPlan(null);

      const summaryText =
        `${result.summary.filesRenamed} file(s) renamed, ` +
        `${result.summary.sidecarsMoved} sidecar(s) moved, ` +
        `${result.summary.nfoFilesWritten} NFO file(s) written.`;

      if (result.summary.errors > 0) {
        setError(
          `Commit finished with ${result.summary.errors} error(s). ` +
            `${summaryText} Check the change report below for failed items.`,
        );
      } else {
        setMessage(`Committed: ${summaryText}`);
      }
      await loadHistory();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to apply commit.'));
    } finally {
      setCommitting(false);
    }
  }

  async function handleRollback(commitId: string) {
    if (
      !window.confirm(
        'Roll back this commit? Files will be restored to their previous paths.',
      )
    ) {
      return;
    }

    setRollingBackId(commitId);
    setError(null);
    setMessage(null);
    setChainResult(null);
    try {
      const result = await rollbackMetadataCommit(token, commitId);
      setMessage(
        `Rolled back ${result.reverted} operation(s)` +
          (result.errors.length > 0
            ? `, with ${result.errors.length} error(s).`
            : '.'),
      );
      await loadHistory();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to roll back commit.'));
    } finally {
      setRollingBackId(null);
    }
  }

  async function handleRollbackTo(commitId: string, commitDate: string) {
    const newerCount = history.filter(
      (c) => !c.rolledBackAt && new Date(c.createdAt) > new Date(commitDate),
    ).length;
    const totalCount = newerCount + 1;
    if (
      !window.confirm(
        `Roll back to this commit? This will reverse ${totalCount} commit(s) in order, ` +
          `stopping if any step fails. Continue?`,
      )
    ) {
      return;
    }

    setRollingBackToId(commitId);
    setError(null);
    setMessage(null);
    setChainResult(null);
    try {
      const result = await rollbackToMetadataCommit(token, commitId);
      setChainResult(result);
      if (result.failedAt) {
        setError(
          `Chain rollback stopped at commit ${result.failedAt.slice(0, 8)} ` +
            `after completing ${result.completed} of ${result.totalToRollback} step(s). ` +
            `System is in the last good state — check errors below.`,
        );
      } else {
        setMessage(
          `Chain rollback complete: ${result.completed} commit(s) reversed.`,
        );
      }
      await loadHistory();
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to chain roll back.'));
    } finally {
      setRollingBackToId(null);
    }
  }

  async function handleExportMetadata() {
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await exportMediaMetadata(token);
      const fileName = triggerJsonDownload(payload, payload.exportedAt);
      setMessage(
        `Exported ${payload.itemCount} metadata item(s) to ${fileName}.`,
      );
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to export metadata.'));
    } finally {
      setExporting(false);
    }
  }

  function openImportDialog() {
    importInputRef.current?.click();
  }

  async function handleImportFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);
    setPlan(null);
    setReport(null);
    setChainResult(null);

    try {
      const mode = replaceOnImport ? 'replace' : 'upsert';
      const result = await importMediaMetadata(token, {
        mode,
        file,
      });

      setMessage(`${result.message} Imported from ${file.name}.`);
      await loadHistory();
    } catch (caught) {
      if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError(toApiErrorMessage(caught, 'Failed to import metadata.'));
      }
    } finally {
      setImporting(false);
    }
  }

  const planChanges = plan ? plan.changes.filter((change) => change.willMove) : [];

  return (
    <article
      className={
        embedded
          ? 'metadata-commit-panel-embedded'
          : 'settings-surface settings-surface-full'
      }
    >
      {embedded ? null : (
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Library Maintenance</p>
            <h2>Commit Metadata To Disk</h2>
          </div>
          <span className="settings-pill">Admin Only</span>
        </header>
      )}

      <p className="muted commit-intro">
        Rename and restructure media files on disk to match your edited titles,
        seasons, and episodes. Movies become{' '}
        <code>Title (Year)/Title (Year).ext</code> and shows become{' '}
        <code>Series/Season ##/Series - S##E## - Episode.ext</code>. Sidecar
        subtitles and artwork are moved alongside each video. Every commit is
        recorded so you can roll it back.
      </p>

      <section className="commit-backup-panel">
        <div className="commit-subheader">
          <div>
            <p className="settings-section-kicker">Metadata Backup</p>
            <h3>Export / Import Metadata</h3>
          </div>
        </div>
        <p className="muted commit-backup-copy">
          Export your current metadata index to a JSON file and re-import it
          later on this server.
        </p>

        <div className="commit-toolbar commit-toolbar-tight">
          <label className="commit-toggle">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={(event) => setReplaceOnImport(event.target.checked)}
              disabled={importing || exporting || planning || committing}
            />
            <span>Replace existing metadata during import</span>
          </label>

          <div className="commit-toolbar-spacer" />

          <button
            className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
            type="button"
            onClick={() => void handleExportMetadata()}
            disabled={exporting || importing || planning || committing}
          >
            {exporting ? 'Exporting...' : 'Export Metadata JSON'}
          </button>

          <button
            className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
            type="button"
            onClick={openImportDialog}
            disabled={importing || exporting || planning || committing}
          >
            {importing ? 'Importing...' : 'Import Metadata JSON'}
          </button>

          <input
            ref={importInputRef}
            className="commit-import-input"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handleImportFileSelected(event)}
          />
        </div>
      </section>

      <div className="commit-toolbar">
        <label className="commit-toggle">
          <input
            type="checkbox"
            checked={writeNfo}
            onChange={(event) => setWriteNfo(event.target.checked)}
            disabled={importing || exporting}
          />
          <span>Write Kodi-style .nfo sidecar files</span>
        </label>

        <div className="commit-toolbar-spacer" />

        <button
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={() => void handlePlan()}
          disabled={planning || committing || importing || exporting}
        >
          {planning ? 'Building plan...' : 'Preview Commit Plan'}
        </button>

        <button
          className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={() => void handleCommit()}
          disabled={
            !plan ||
            plan.summary.movableItems === 0 ||
            planning ||
            committing ||
            importing ||
            exporting
          }
        >
          {committing ? 'Committing...' : 'Commit Now'}
        </button>
      </div>

      {message || error ? (
        <div className="commit-status-row" aria-live="polite">
          {message ? (
            <p className="commit-status commit-status-ok">{message}</p>
          ) : null}
          {error ? (
            <p className="commit-status commit-status-error">{error}</p>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <section className="settings-scan-progress" aria-live="polite">
          <div className="settings-scan-progress-head">
            <strong>
              Plan: {plan.summary.movableItems} of {plan.summary.totalItems}{' '}
              item(s) will move
            </strong>
          </div>

          <div className="commit-summary-grid">
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Files</span>
              <span className="commit-summary-cell-value">
                {plan.summary.movableItems}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Sidecars</span>
              <span className="commit-summary-cell-value">
                {plan.summary.sidecars}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">NFO</span>
              <span className="commit-summary-cell-value">
                {plan.summary.nfoFiles}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Skipped</span>
              <span className="commit-summary-cell-value">
                {plan.summary.skippedItems}
              </span>
            </div>
          </div>

          {planChanges.length > 0 ? (
            <div className="commit-changes-list">
              {planChanges.map((change) => (
                <div key={change.mediaId} className="commit-change-row">
                  <div className="commit-change-title">{change.title}</div>
                  <div className="commit-change-paths">
                    <div className="commit-change-path-row">
                      <span className="commit-change-path-label">From</span>
                      <code>{relativeName(change.currentPath)}</code>
                    </div>
                    <div className="commit-change-path-row">
                      <span className="commit-change-path-label">To</span>
                      <code>{change.targetPath}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {plan.skipped.length > 0 ? (
            <details className="commit-skipped">
              <summary>{plan.skipped.length} skipped item(s)</summary>
              <ul>
                {plan.skipped.map((change) => (
                  <li key={change.mediaId}>
                    <strong>{change.title}</strong> — {change.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {report ? (
        <section className="settings-scan-progress" aria-live="polite">
          <div className="settings-scan-progress-head">
            <strong>Change Report</strong>
            <span>commit {report.commitId.slice(0, 8)}</span>
          </div>

          <div className="commit-summary-grid">
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Renamed</span>
              <span className="commit-summary-cell-value">
                {report.summary.filesRenamed}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Sidecars</span>
              <span className="commit-summary-cell-value">
                {report.summary.sidecarsMoved}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">NFO</span>
              <span className="commit-summary-cell-value">
                {report.summary.nfoFilesWritten}
              </span>
            </div>
            <div className="commit-summary-cell">
              <span className="commit-summary-cell-label">Errors</span>
              <span className="commit-summary-cell-value">
                {report.summary.errors}
              </span>
            </div>
          </div>

          {report.changes.length > 0 ? (
            <div className="commit-changes-list">
              {report.changes.map((change) => (
                <div key={change.mediaId} className="commit-change-row">
                  <div className="commit-change-title">{change.title}</div>
                  <div className="commit-change-paths">
                    <div className="commit-change-path-row">
                      <span className="commit-change-path-label">From</span>
                      <code>{relativeName(change.from)}</code>
                    </div>
                    <div className="commit-change-path-row">
                      <span className="commit-change-path-label">To</span>
                      <code>{relativeName(change.to)}</code>
                    </div>
                    {change.sidecarCount > 0 || change.nfoWritten || change.error ? (
                      <div className="commit-change-meta">
                        {change.sidecarCount > 0
                          ? `+${change.sidecarCount} sidecar${change.sidecarCount === 1 ? '' : 's'}`
                          : null}
                        {change.sidecarCount > 0 && change.nfoWritten ? ' · ' : ''}
                        {change.nfoWritten ? '+ NFO' : ''}
                        {change.error ? (
                          <span className="error-text"> — {change.error}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="commit-subheader">
        <div>
          <p className="settings-section-kicker">History</p>
          <h3>Recent Commits</h3>
        </div>
        <button
          className="ghost-button small !rounded-lg !px-3 !py-1.5"
          type="button"
          onClick={() => void loadHistory()}
          disabled={loadingHistory || importing || exporting}
        >
          {loadingHistory ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {history.length === 0 ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          {loadingHistory ? 'Loading commit history…' : 'No commits yet.'}
        </p>
      ) : (
        <ul className="commit-history-list">
          {history.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.rolledBackAt
                  ? 'commit-history-item is-rolled-back'
                  : 'commit-history-item'
              }
            >
              <div className="commit-history-info">
                <span className="commit-history-title">
                  {formatTimestamp(entry.createdAt)}
                </span>
                <span className="commit-history-meta">
                  {entry.summary.filesRenamed} renamed ·{' '}
                  {entry.summary.sidecarsMoved} sidecars ·{' '}
                  {entry.summary.nfoFilesWritten} NFO ·{' '}
                  {entry.summary.errors} error
                  {entry.summary.errors === 1 ? '' : 's'}
                </span>
                {entry.rolledBackAt ? (
                  <span className="commit-history-rolledback">
                    Rolled back {formatTimestamp(entry.rolledBackAt)}
                  </span>
                ) : null}
              </div>
              <div className="commit-history-actions">
                <button
                  type="button"
                  className="ghost-button small !rounded-lg !px-3 !py-1.5"
                  onClick={() => void handleRollback(entry.id)}
                  disabled={
                    !!entry.rolledBackAt ||
                    rollingBackId === entry.id ||
                    !!rollingBackToId ||
                    committing ||
                    importing ||
                    exporting
                  }
                >
                  {entry.rolledBackAt
                    ? 'Rolled Back'
                    : rollingBackId === entry.id
                      ? 'Rolling Back...'
                      : 'Rollback'}
                </button>
                {!entry.rolledBackAt ? (
                  <button
                    type="button"
                    className="ghost-button small !rounded-lg !px-3 !py-1.5"
                    title="Roll back this commit and all newer commits in order"
                    onClick={() => void handleRollbackTo(entry.id, entry.createdAt)}
                    disabled={
                      !!rollingBackToId ||
                      !!rollingBackId ||
                      committing ||
                      importing ||
                      exporting
                    }
                  >
                    {rollingBackToId === entry.id
                      ? 'Rolling Back...'
                      : 'Rollback to here'}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {chainResult ? (
        <section className="settings-scan-progress" aria-live="polite">
          <div className="settings-scan-progress-head">
            <strong>Chain Rollback Results</strong>
            <span>
              {chainResult.completed}/{chainResult.totalToRollback} completed
            </span>
          </div>
          <ul className="commit-changes-list">
            {chainResult.results.map((r) => (
              <li key={r.commitId} className="commit-change-row">
                <div className="commit-change-title">
                  <code>{r.commitId.slice(0, 8)}</code>
                  {r.success ? (
                    <span style={{ color: 'var(--color-success, #4ade80)', marginLeft: '0.5rem' }}>
                      ✓ {r.reverted} op(s) reverted
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-error, #f87171)', marginLeft: '0.5rem' }}>
                      ✗ stopped here
                    </span>
                  )}
                </div>
                {r.errors.length > 0 ? (
                  <ul className="commit-change-paths">
                    {r.errors.map((e, i) => (
                      <li key={i} className="error-text" style={{ fontSize: '0.8rem' }}>
                        {e}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
