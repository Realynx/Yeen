import type { CommitPlanResponse } from '../../shared/services/api';

interface MetadataCommitPlanSectionProps {
  plan: CommitPlanResponse | null;
}

function relativeName(path: string): string {
  const parts = path.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last || path;
}

export function MetadataCommitPlanSection({ plan }: MetadataCommitPlanSectionProps) {
  if (!plan) {
    return null;
  }

  const planChanges = plan.changes.filter((change) => change.willMove);

  return (
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
  );
}
