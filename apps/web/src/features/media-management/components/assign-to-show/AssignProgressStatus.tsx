import type { AssignProgressState } from './types';

interface AssignProgressStatusProps {
  saving: boolean;
  assignProgress: AssignProgressState;
}

export function AssignProgressStatus({
  saving,
  assignProgress,
}: AssignProgressStatusProps) {
  if (!saving) {
    return null;
  }

  const assignProgressPercent =
    assignProgress.mode === 'per-item' && assignProgress.total > 0
      ? Math.round((assignProgress.completed / assignProgress.total) * 100)
      : 0;

  const assignStatusTitle =
    assignProgress.phase === 'preparing'
      ? 'Preparing episode assignments'
      : assignProgress.phase === 'finalizing'
        ? 'Finalizing metadata updates'
        : assignProgress.mode === 'bulk'
          ? 'Applying bulk assignment'
          : 'Updating episodes and artwork';

  const assignStatusDescription =
    assignProgress.mode === 'bulk'
      ? 'The server is processing this in one batch. This can take a moment when artwork and thumbnails are rebuilt.'
      : assignProgress.total > 0
        ? `Processed ${assignProgress.completed} of ${assignProgress.total} items${
            assignProgress.currentPath ? ` • ${assignProgress.currentPath}` : ''
          }`
        : 'Starting assignment workflow...';

  return (
    <section className="metadata-assign-status" aria-live="polite" role="status">
      <div className="metadata-assign-status-orb" aria-hidden="true" />
      <div className="metadata-assign-status-body">
        <p className="metadata-assign-status-title">{assignStatusTitle}</p>
        <p className="metadata-assign-status-copy">{assignStatusDescription}</p>
        <div
          className={`metadata-assign-status-bar${
            assignProgress.mode === 'bulk' ? ' is-indeterminate' : ''
          }`}
        >
          <span
            style={
              assignProgress.mode === 'per-item'
                ? { width: `${assignProgressPercent}%` }
                : undefined
            }
          />
        </div>
      </div>
    </section>
  );
}
