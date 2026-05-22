import { useEffect, useMemo, useState } from 'react';
import {
  bulkDeleteMediaPermanently,
  toApiErrorMessage,
  type BulkDeleteMediaResult,
} from '../lib/api';
import type { MediaItem } from '../lib/types';

interface DeleteMediaDialogProps {
  token: string;
  selectedItems: MediaItem[];
  onClose: () => void;
  onDeleted: (result: BulkDeleteMediaResult) => void;
}

const PREVIEW_LIMIT = 6;

export function DeleteMediaDialog({
  token,
  selectedItems,
  onClose,
  onDeleted,
}: DeleteMediaDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => selectedItems.map((item) => item.id), [selectedItems]);
  const totalCount = selectedItems.length;
  const hiddenCount = Math.max(0, totalCount - PREVIEW_LIMIT);
  const previewItems = selectedItems.slice(0, PREVIEW_LIMIT);
  const confirmationPhrase = useMemo(() => `DELETE ${totalCount}`, [totalCount]);

  const canDelete =
    !submitting &&
    confirmText.trim().toUpperCase() === confirmationPhrase;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, submitting]);

  async function handleDelete() {
    if (!canDelete || totalCount === 0) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await bulkDeleteMediaPermanently(token, ids);
      onDeleted(result);
    } catch (deleteError) {
      setError(toApiErrorMessage(deleteError, 'Failed to delete media.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="metadata-modal-backdrop"
      role="presentation"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="metadata-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-media-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="metadata-modal-header">
          <div>
            <p className="metadata-modal-eyebrow metadata-modal-eyebrow-danger">
              Delete To Recycle
            </p>
            <h2 id="delete-media-modal-title">
              Delete {totalCount} {totalCount === 1 ? 'item' : 'items'} from library?
            </h2>
            <p className="metadata-modal-path">
              This removes selected metadata and moves files into recycle folders on their
              original drives.
            </p>
          </div>
          <button
            type="button"
            className="metadata-modal-close"
            onClick={onClose}
            disabled={submitting}
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

        <div className="metadata-grid delete-media-grid">
          {step === 1 ? (
            <>
              <section className="delete-media-warning" aria-label="Warning">
                <p>
                  This removes selected metadata and moves matching media files to recycle.
                  Restore is possible by recovering files from that recycle folder.
                </p>
              </section>

              <section className="delete-media-preview" aria-label="Selected media">
                <p className="metadata-preview-label">Selected Items</p>
                <ul className="delete-media-list">
                  {previewItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.relativePath}</span>
                    </li>
                  ))}
                </ul>
                {hiddenCount > 0 ? (
                  <p className="metadata-field-hint">
                    + {hiddenCount} more {hiddenCount === 1 ? 'item' : 'items'} selected
                  </p>
                ) : null}
              </section>
            </>
          ) : (
            <section className="delete-media-confirm" aria-label="Final confirmation">
              <p>
                Final step: type <strong>{confirmationPhrase}</strong> to confirm permanent
                deletion.
              </p>
              <label className="metadata-field metadata-field-wide" htmlFor="delete-confirm-input">
                <span>Confirmation Text</span>
                <input
                  id="delete-confirm-input"
                  type="text"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
            </section>
          )}
        </div>

        {error ? <p className="metadata-modal-error">{error}</p> : null}

        <footer className="metadata-modal-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>

          {step === 1 ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setStep(2)}
              disabled={submitting || totalCount === 0}
            >
              Continue
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDelete}
                disabled={!canDelete}
              >
                {submitting ? 'Deleting...' : 'Delete To Recycle'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
