import type {
  CommitChainRollbackResponse,
  CommitHistoryEntry,
} from '../../shared/services/api';

interface MetadataCommitHistorySectionProps {
  history: CommitHistoryEntry[];
  loadingHistory: boolean;
  importing: boolean;
  exporting: boolean;
  committing: boolean;
  rollingBackId: string | null;
  rollingBackToId: string | null;
  chainResult: CommitChainRollbackResponse | null;
  onRefreshHistory: () => Promise<void>;
  onRollback: (commitId: string) => Promise<void>;
  onRollbackTo: (commitId: string, commitDate: string) => Promise<void>;
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type HistoryItemProps = Pick<MetadataCommitHistorySectionProps,
  'rollingBackId' | 'rollingBackToId' | 'committing' | 'importing' | 'exporting'
  | 'onRollback' | 'onRollbackTo'> & { entry: CommitHistoryEntry };

function MetadataCommitHistoryItem({
  entry,
  rollingBackId,
  rollingBackToId,
  committing,
  importing,
  exporting,
  onRollback,
  onRollbackTo,
}: HistoryItemProps) {
  const operationBusy = committing || importing || exporting;
  const rollbackDisabled = Boolean(entry.rolledBackAt || rollingBackToId)
    || rollingBackId === entry.id || operationBusy;
  const rollbackToDisabled = Boolean(rollingBackToId || rollingBackId) || operationBusy;
  const rollbackLabel = entry.rolledBackAt
    ? 'Rolled Back'
    : rollingBackId === entry.id ? 'Rolling Back...' : 'Rollback';

  return (
    <li className={entry.rolledBackAt ? 'commit-history-item is-rolled-back' : 'commit-history-item'}>
      <div className="commit-history-info">
        <span className="commit-history-title">{formatTimestamp(entry.createdAt)}</span>
        <span className="commit-history-meta">
          {entry.summary.filesRenamed} renamed · {entry.summary.sidecarsMoved} sidecars ·{' '}
          {entry.summary.nfoFilesWritten} NFO · {entry.summary.errors} error
          {entry.summary.errors === 1 ? '' : 's'}
        </span>
        {entry.rolledBackAt ? (
          <span className="commit-history-rolledback">
            Rolled back {formatTimestamp(entry.rolledBackAt)}
          </span>
        ) : null}
      </div>
      <div className="commit-history-actions">
        <button type="button" className="ghost-button small !rounded-lg !px-3 !py-1.5"
          onClick={() => void onRollback(entry.id)} disabled={rollbackDisabled}>
          {rollbackLabel}
        </button>
        {entry.rolledBackAt ? null : (
          <button type="button" className="ghost-button small !rounded-lg !px-3 !py-1.5"
            title="Roll back this commit and all newer commits in order"
            onClick={() => void onRollbackTo(entry.id, entry.createdAt)} disabled={rollbackToDisabled}>
            {rollingBackToId === entry.id ? 'Rolling Back...' : 'Rollback to here'}
          </button>
        )}
      </div>
    </li>
  );
}

export function MetadataCommitHistorySection({
  history,
  loadingHistory,
  importing,
  exporting,
  committing,
  rollingBackId,
  rollingBackToId,
  chainResult,
  onRefreshHistory,
  onRollback,
  onRollbackTo,
}: MetadataCommitHistorySectionProps) {
  return (
    <>
      <div className="commit-subheader">
        <div>
          <p className="settings-section-kicker">History</p>
          <h3>Recent Commits</h3>
        </div>
        <button
          className="ghost-button small !rounded-lg !px-3 !py-1.5"
          type="button"
          onClick={() => void onRefreshHistory()}
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
            <MetadataCommitHistoryItem key={entry.id} entry={entry}
              rollingBackId={rollingBackId} rollingBackToId={rollingBackToId}
              committing={committing} importing={importing} exporting={exporting}
              onRollback={onRollback} onRollbackTo={onRollbackTo} />
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
            {chainResult.results.map((result) => (
              <li key={result.commitId} className="commit-change-row">
                <div className="commit-change-title">
                  <code>{result.commitId.slice(0, 8)}</code>
                  {result.success ? (
                    <span style={{ color: 'var(--color-success, #4ade80)', marginLeft: '0.5rem' }}>
                      ✓ {result.reverted} op(s) reverted
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-error, #f87171)', marginLeft: '0.5rem' }}>
                      ✗ stopped here
                    </span>
                  )}
                </div>
                {result.errors.length > 0 ? (
                  <ul className="commit-change-paths">
                    {result.errors.map((error, index) => (
                      <li key={index} className="error-text" style={{ fontSize: '0.8rem' }}>
                        {error}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
