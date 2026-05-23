import type { EpisodeOrder } from './types';

interface AssignDialogHeaderProps {
  workingItemCount: number;
  order: EpisodeOrder;
  detectionCount: number;
  rowCount: number;
  customRuleCount: number;
  sampleCount: number;
  safeSeason: number;
  safeStart: number;
  busy: boolean;
  onClose: () => void;
}

export function AssignDialogHeader({
  workingItemCount,
  order,
  detectionCount,
  rowCount,
  customRuleCount,
  sampleCount,
  safeSeason,
  safeStart,
  busy,
  onClose,
}: AssignDialogHeaderProps) {
  return (
    <header className="metadata-modal-header">
      <div>
        <p className="metadata-modal-eyebrow">Assign to Series</p>
        <h2 id="assign-modal-title">
          {workingItemCount} {workingItemCount === 1 ? 'item' : 'items'} selected
        </h2>
        <p className="metadata-modal-path">
          {order === 'detect-from-filename'
            ? `Detected ${detectionCount} of ${rowCount} files from names; ${customRuleCount} used custom keyword/pattern rules and ${sampleCount} were flagged as sample clips (season -1). Unmatched files are numbered sequentially.`
            : `Numbered starting at S${String(safeSeason).padStart(2, '0')}E${String(safeStart).padStart(2, '0')}.`}
        </p>
      </div>
      <button
        type="button"
        className="metadata-modal-close"
        onClick={onClose}
        disabled={busy}
        aria-label="Close dialog"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M6 6 L18 18 M18 6 L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </header>
  );
}
