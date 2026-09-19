import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  applyMetadataCommit,
  exportMediaMetadata,
  importMediaMetadata,
  listMetadataCommitHistory,
  planMetadataCommit,
  rollbackMetadataCommit,
  rollbackToMetadataCommit,
  toApiErrorMessage,
  type CommitApplyResponse,
  type CommitChainRollbackResponse,
  type CommitHistoryEntry,
  type CommitPlanResponse,
} from '../../shared/services/api';
import { MetadataCommitHistorySection } from './MetadataCommitHistorySection';
import { MetadataCommitBackupSection } from './MetadataCommitBackupSection';
import { MetadataCommitPlanSection } from './MetadataCommitPlanSection';
import { MetadataCommitReportSection } from './MetadataCommitReportSection';

interface MetadataCommitPanelProps {
  token: string;
  embedded?: boolean;
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

function MetadataCommitHeader({ embedded }: { embedded: boolean }) {
  if (embedded) return null;
  return (
    <header className="settings-surface-header">
      <div><p className="settings-section-kicker">Library Maintenance</p><h2>Commit Metadata To Disk</h2></div>
      <span className="settings-pill">Admin Only</span>
    </header>
  );
}

function MetadataCommitStatus({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) return null;
  return (
    <div className="commit-status-row" aria-live="polite">
      {message ? <p className="commit-status commit-status-ok">{message}</p> : null}
      {error ? <p className="commit-status commit-status-error">{error}</p> : null}
    </div>
  );
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

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const result = await listMetadataCommitHistory(token);
      setHistory(result);
    } catch (caught) {
      setError(toApiErrorMessage(caught, 'Failed to load commit history.'));
    } finally {
      setLoadingHistory(false);
    }
  }, [token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadHistory]);

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

      if (result.summary.errors > 0 || result.integrationWarnings?.length) {
        const integrationText = result.integrationWarnings?.length
          ? ` ${result.integrationWarnings.length} add-on protection warning(s) require attention.`
          : '';
        setError(
          `Commit finished with ${result.summary.errors} error(s). ` +
            `${summaryText}${integrationText} Check the change report below for details.`,
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

  return (
    <article
      className={
        embedded
          ? 'metadata-commit-panel-embedded'
          : 'settings-surface settings-surface-full'
      }
    >
      <MetadataCommitHeader embedded={embedded} />

      <p className="muted commit-intro">
        Rename and restructure media files on disk to match your edited titles,
        seasons, and episodes. Movies become{' '}
        <code>Title (Year)/Title (Year).ext</code> and shows become{' '}
        <code>Series/Season ##/Series - S##E## - Episode.ext</code>. Sidecar
        subtitles and artwork are moved alongside each video. Every commit is
        recorded so you can roll it back.
      </p>

      <MetadataCommitBackupSection
        replaceOnImport={replaceOnImport}
        importing={importing}
        exporting={exporting}
        planning={planning}
        committing={committing}
        importInputRef={importInputRef}
        onSetReplaceOnImport={setReplaceOnImport}
        onExport={() => void handleExportMetadata()}
        onOpenImportDialog={openImportDialog}
        onImportFileSelected={(event) => void handleImportFileSelected(event)}
      />

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

      <MetadataCommitStatus message={message} error={error} />

      <MetadataCommitPlanSection plan={plan} />

      <MetadataCommitReportSection report={report} />

      <MetadataCommitHistorySection
        history={history}
        loadingHistory={loadingHistory}
        importing={importing}
        exporting={exporting}
        committing={committing}
        rollingBackId={rollingBackId}
        rollingBackToId={rollingBackToId}
        chainResult={chainResult}
        onRefreshHistory={loadHistory}
        onRollback={handleRollback}
        onRollbackTo={handleRollbackTo}
      />
    </article>
  );
}
