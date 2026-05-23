import type { FilenameParseRules } from '../../services/filenameParse';
import {
  detectionBadgeLabel,
  detectionTitle,
  renderHighlightedPath,
} from './assignmentRows';
import type { AssignmentRow } from './types';

interface AssignmentPreviewListProps {
  effectiveRows: AssignmentRow[];
  rows: AssignmentRow[];
  isDetectMode: boolean;
  detectionCount: number;
  customRuleCount: number;
  sampleCount: number;
  detectRules: FilenameParseRules;
  overrides: Record<string, { season: string; episode: string }>;
  pendingDeleteId: string | null;
  deletingId: string | null;
  busy: boolean;
  onRowOverride: (
    itemId: string,
    field: 'season' | 'episode',
    value: string,
  ) => void;
  onBeginDeletePreviewItem: (itemId: string) => void;
  onCancelDeletePreviewItem: (itemId: string) => void;
  onConfirmDeletePreviewItem: (row: AssignmentRow) => Promise<void>;
}

export function AssignmentPreviewList({
  effectiveRows,
  rows,
  isDetectMode,
  detectionCount,
  customRuleCount,
  sampleCount,
  detectRules,
  overrides,
  pendingDeleteId,
  deletingId,
  busy,
  onRowOverride,
  onBeginDeletePreviewItem,
  onCancelDeletePreviewItem,
  onConfirmDeletePreviewItem,
}: AssignmentPreviewListProps) {
  return (
    <div className="metadata-preview">
      <p className="metadata-preview-label">
        Assignment Preview
        {isDetectMode ? (
          <span className="metadata-preview-hint">
            {' '}
            · {detectionCount} detected / {rows.length - detectionCount} sequential /
            {' '}
            {customRuleCount} custom-rule matches / {sampleCount} sample clips
          </span>
        ) : null}
      </p>
      <p className="metadata-preview-hint metadata-preview-hint-strong">
        Season and episode fields below are always editable, regardless of mode.
      </p>
      <ol className="metadata-preview-list">
        {effectiveRows.length === 0 ? (
          <li className="metadata-preview-row metadata-preview-row-empty">
            No items left in preview. Delete actions here are permanent.
          </li>
        ) : (
          effectiveRows.map((row) => {
            const isDeletePending = pendingDeleteId === row.item.id;
            const isDeletingThisRow = deletingId === row.item.id;

            return (
              <li key={row.item.id} className="metadata-preview-row">
                <span
                  className={
                    overrides[row.item.id]
                      ? 'metadata-row-indicator is-edited'
                      : row.detectionSource === 'pattern'
                        ? 'metadata-row-indicator is-pattern'
                        : row.detectionSource === 'keyword'
                          ? 'metadata-row-indicator is-keyword'
                          : row.detectionSource === 'sample'
                            ? 'metadata-row-indicator is-sample'
                            : row.detected
                              ? 'metadata-row-indicator is-detected'
                              : 'metadata-row-indicator'
                  }
                  title={
                    overrides[row.item.id] ? 'Manually edited' : detectionTitle(row)
                  }
                />
                <span
                  className={`metadata-preview-tag${
                    row.detectionSource === 'pattern'
                      ? ' is-pattern'
                      : row.detectionSource === 'keyword'
                        ? ' is-keyword'
                        : row.detectionSource === 'sample'
                          ? ' is-sample'
                          : row.detectionSource === 'existing'
                            ? ' is-existing'
                            : row.detectionSource === 'builtin'
                              ? ' is-detected'
                              : ''
                  }`}
                  title={detectionTitle(row)}
                >
                  {detectionBadgeLabel(row)}
                </span>
                <span className="metadata-row-se">
                  <span className="metadata-row-prefix">S</span>
                  <input
                    type="number"
                    className={`metadata-row-input${overrides[row.item.id] ? ' is-overridden' : ''}`}
                    value={overrides[row.item.id]?.season ?? String(row.seasonNumber)}
                    onChange={(event) =>
                      onRowOverride(row.item.id, 'season', event.target.value)
                    }
                    min={-1}
                    aria-label={`Season for ${row.item.relativePath}`}
                  />
                  <span className="metadata-row-prefix">E</span>
                  <input
                    type="number"
                    className={`metadata-row-input${overrides[row.item.id] ? ' is-overridden' : ''}`}
                    value={overrides[row.item.id]?.episode ?? String(row.episodeNumber)}
                    onChange={(event) =>
                      onRowOverride(row.item.id, 'episode', event.target.value)
                    }
                    min={0}
                    aria-label={`Episode for ${row.item.relativePath}`}
                  />
                </span>
                <span className="metadata-preview-path" title={row.item.relativePath}>
                  {renderHighlightedPath(row, detectRules)}
                </span>
                <span className="metadata-preview-actions">
                  {isDeletePending ? (
                    <>
                      <button
                        type="button"
                        className="metadata-preview-delete is-confirm"
                        disabled={busy}
                        onClick={() => {
                          void onConfirmDeletePreviewItem(row);
                        }}
                      >
                        {isDeletingThisRow ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        className="metadata-preview-delete-cancel"
                        disabled={busy}
                        onClick={() => onCancelDeletePreviewItem(row.item.id)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="metadata-preview-delete"
                      disabled={busy}
                      onClick={() => onBeginDeletePreviewItem(row.item.id)}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
