import type { MediaStorageSummary } from '../../shared/services/types';
import { formatBytes } from '../../shared/services/formatters';

interface StorageUsageMeterProps {
  summary: MediaStorageSummary | null;
  loading: boolean;
  error?: string | null;
  title: string;
  className?: string;
}

const STORAGE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

function clampPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function toDriveSummaryLabel(summary: MediaStorageSummary | null): string {
  if (!summary) {
    return 'No drives detected';
  }

  const driveLabel = `${summary.driveCount} drive${summary.driveCount === 1 ? '' : 's'}`;
  if (summary.unavailableDriveCount <= 0) {
    return driveLabel;
  }

  const unavailableLabel = `${summary.unavailableDriveCount} unavailable`;
  return `${driveLabel}, ${unavailableLabel}`;
}

export function StorageUsageMeter({
  summary,
  loading,
  error,
  title,
  className,
}: StorageUsageMeterProps) {
  const usedPercent = clampPercent(summary?.usedPercent);
  const usedBytes = summary?.usedBytes ?? 0;
  const availableBytes = summary?.availableBytes ?? 0;
  const totalBytes = summary?.totalBytes ?? 0;
  const note = loading
    ? 'Loading storage metrics...'
    : error
      ? 'Storage metrics unavailable.'
      : null;

  const classes = ['storage-usage-meter'];
  if (className) {
    classes.push(className);
  }

  return (
    <section className={classes.join(' ')} aria-live="polite">
      <div className="storage-usage-head">
        <p className="storage-usage-title">{title}</p>
        <span className="storage-usage-total">
          {formatBytes(totalBytes, { units: STORAGE_SIZE_UNITS })} total
        </span>
      </div>

      <div
        className="storage-usage-track"
        role="progressbar"
        aria-label={`${title} used storage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usedPercent)}
      >
        <div style={{ width: `${usedPercent}%` }} />
      </div>

      <div className="storage-usage-metrics">
        <span className="storage-usage-metric">
          <strong>{formatBytes(usedBytes, { units: STORAGE_SIZE_UNITS })}</strong>
          <span>used</span>
        </span>
        <span className="storage-usage-metric">
          <strong>{formatBytes(availableBytes, { units: STORAGE_SIZE_UNITS })}</strong>
          <span>available</span>
        </span>
        <span className="storage-usage-drives">{toDriveSummaryLabel(summary)}</span>
      </div>

      {note ? <p className="storage-usage-note">{note}</p> : null}
    </section>
  );
}
