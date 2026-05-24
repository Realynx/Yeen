import type { CommitApplyResponse } from '../../shared/services/api';

interface MetadataCommitReportSectionProps {
  report: CommitApplyResponse | null;
}

function relativeName(path: string): string {
  const parts = path.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last || path;
}

export function MetadataCommitReportSection({
  report,
}: MetadataCommitReportSectionProps) {
  if (!report) {
    return null;
  }

  return (
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
  );
}
