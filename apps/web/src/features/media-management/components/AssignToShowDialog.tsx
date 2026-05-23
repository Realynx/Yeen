import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  bulkDeleteMediaPermanently,
  toApiErrorMessage,
  type MetadataSearchCandidate,
} from '../../shared/services/api';
import { useMetadataSuggestions } from '../services/useMetadataSuggestions';
import type { MediaItem } from '../../shared/services/types';
import { AssignmentPreviewList } from './assign-to-show/AssignmentPreviewList';
import { AssignDialogBasicFields } from './assign-to-show/AssignDialogBasicFields';
import { AssignProgressStatus } from './assign-to-show/AssignProgressStatus';
import { AssignDialogHeader } from './assign-to-show/AssignDialogHeader';
import { DetectionRulesEditor } from './assign-to-show/DetectionRulesEditor';
import { createIdleProgressState } from './assign-to-show/detectRules';
import {
  initialRuleDraftsFromSelection,
  initialTagsInputFromSelection,
  toPersistedSeriesAssignmentRules,
} from './assign-to-show/initialRules';
import { submitAssignment } from './assign-to-show/submitAssignment';
import type { AssignToShowDialogProps, EpisodeOrder } from './assign-to-show/types';
import { useAssignmentPreview } from './assign-to-show/useAssignmentPreview';
import { useRuleDrafts } from './assign-to-show/useRuleDrafts';

export function AssignToShowDialog({
  token,
  selectedItems,
  onClose,
  onAssigned,
}: AssignToShowDialogProps) {
  const [workingItems, setWorkingItems] = useState<MediaItem[]>(selectedItems);
  const suggestedTitle = useMemo(() => {
    const showTitle = workingItems.find((item) => item.type === 'show')?.title;
    return showTitle ?? workingItems[0]?.title ?? '';
  }, [workingItems]);
  const initialTagsInput = useMemo(
    () => initialTagsInputFromSelection(workingItems),
    [workingItems],
  );
  const initialRuleDrafts = useMemo(
    () => initialRuleDraftsFromSelection(workingItems),
    [workingItems],
  );

  const [title, setTitle] = useState(suggestedTitle);
  const [order, setOrder] = useState<EpisodeOrder>('detect-from-filename');
  const [candidateReleaseYear, setCandidateReleaseYear] = useState<number | null>(
    null,
  );
  const [tagsInput, setTagsInput] = useState(initialTagsInput);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [candidateOverview, setCandidateOverview] = useState<string | null>(null);
  const [candidatePosterUrl, setCandidatePosterUrl] = useState<string | null>(null);
  const [candidateBackdropUrl, setCandidateBackdropUrl] = useState<string | null>(
    null,
  );
  const [candidateRemoteSource, setCandidateRemoteSource] = useState<
    'tmdb' | 'jikan' | null
  >(null);
  const [candidateRemoteSourceId, setCandidateRemoteSourceId] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignProgress, setAssignProgress] = useState(createIdleProgressState);

  const {
    keywordRules,
    patternRules,
    detectRuleSet,
    addKeywordRule,
    updateKeywordRule,
    removeKeywordRule,
    addPatternRule,
    updatePatternRule,
    updatePatternRuleCaseSensitivity,
    removePatternRule,
  } = useRuleDrafts(initialRuleDrafts);

  const safeSeason = 1;
  const safeStart = 1;
  const safeYear = candidateReleaseYear;

  const {
    rows,
    effectiveRows,
    overrides,
    detectionCount,
    customRuleCount,
    sampleCount,
    singleSeason,
    isDetectMode,
    handleRowOverride,
    removeOverridesForItem,
  } = useAssignmentPreview(
    workingItems,
    order,
    safeSeason,
    safeStart,
    detectRuleSet.rules,
  );

  const busy = saving || deletingId !== null;

  useEffect(() => {
    // Keep dialog-local working selection in sync when parent selection changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkingItems(selectedItems);
    setPendingDeleteId(null);
    setDeletingId(null);
  }, [selectedItems]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [busy, onClose]);

  const suggestions = useMetadataSuggestions({
    token,
    title,
    type: 'show',
    year: safeYear,
  });

  function beginDeletePreviewItem(itemId: string) {
    if (busy) {
      return;
    }

    setPendingDeleteId((current) => (current === itemId ? null : itemId));
  }

  function cancelDeletePreviewItem(itemId: string) {
    if (pendingDeleteId === itemId) {
      setPendingDeleteId(null);
    }
  }

  async function confirmDeletePreviewItem(row: (typeof effectiveRows)[number]) {
    if (busy) {
      return;
    }

    setDeletingId(row.item.id);
    setError(null);

    try {
      const result = await bulkDeleteMediaPermanently(token, [row.item.id]);
      const first = result.results[0];
      if (!first?.success) {
        throw new Error(first?.error || 'Delete failed for selected media item.');
      }

      setWorkingItems((prev) => prev.filter((item) => item.id !== row.item.id));
      removeOverridesForItem(row.item.id);
      setPendingDeleteId(null);
    } catch (deleteError) {
      setError(
        toApiErrorMessage(
          deleteError,
          'Failed to delete media item from assignment preview.',
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }

  function applyCandidate(candidate: MetadataSearchCandidate) {
    setTitle(candidate.title);
    if (
      typeof candidate.releaseYear === 'number' &&
      Number.isFinite(candidate.releaseYear)
    ) {
      setCandidateReleaseYear(Math.floor(candidate.releaseYear));
    } else {
      setCandidateReleaseYear(null);
    }

    setCandidateOverview(candidate.overview ?? null);
    if (candidate.tags.length > 0 && tagsInput.trim().length === 0) {
      setTagsInput(candidate.tags.join(', '));
      setTagsDirty(true);
    }

    setCandidatePosterUrl(candidate.posterUrl ?? null);
    setCandidateBackdropUrl(candidate.backdropUrl ?? null);
    setCandidateRemoteSource(candidate.remoteSource);
    setCandidateRemoteSourceId(candidate.remoteSourceId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (workingItems.length === 0) {
      setError('No media items remain in assignment preview.');
      return;
    }

    const cleanedTitle = title.trim();
    if (!cleanedTitle) {
      setError('Title is required.');
      return;
    }

    if (isDetectMode && detectRuleSet.errors.length > 0) {
      setError('Fix invalid detection rules before assigning episodes.');
      return;
    }

    setSaving(true);
    setPendingDeleteId(null);
    setError(null);
    setAssignProgress({
      mode: 'per-item',
      phase: 'preparing',
      total: effectiveRows.length,
      completed: 0,
      currentPath: null,
    });

    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      const shouldApplyTags = tagsDirty;
      const candidateDescription = candidateOverview?.trim() ?? '';
      const seriesAssignmentRules = toPersistedSeriesAssignmentRules(
        detectRuleSet.rules,
      );
      const hasOverrides = Object.keys(overrides).length > 0;

      const updated = await submitAssignment({
        token,
        effectiveRows,
        singleSeason,
        hasOverrides,
        cleanedTitle,
        safeSeason,
        safeStart,
        safeYear,
        shouldApplyTags,
        tags,
        candidateDescription,
        candidatePosterUrl,
        candidateBackdropUrl,
        candidateRemoteSource,
        candidateRemoteSourceId,
        seriesAssignmentRules,
        setAssignProgress,
      });

      onAssigned(updated);
    } catch (saveError) {
      setError(toApiErrorMessage(saveError, 'Failed to assign episodes.'));
    } finally {
      setSaving(false);
      setAssignProgress(createIdleProgressState());
    }
  }

  return (
    <div
      className="metadata-modal-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="metadata-modal metadata-modal-wide metadata-modal-assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <AssignDialogHeader
          workingItemCount={workingItems.length}
          order={order}
          detectionCount={detectionCount}
          rowCount={rows.length}
          customRuleCount={customRuleCount}
          sampleCount={sampleCount}
          safeSeason={safeSeason}
          safeStart={safeStart}
          busy={busy}
          onClose={onClose}
        />

        <form className="metadata-form" onSubmit={handleSubmit}>
          <div className="metadata-grid">
            <AssignDialogBasicFields
              title={title}
              onTitleChange={setTitle}
              tagsInput={tagsInput}
              onTagsChange={(value) => {
                setTagsInput(value);
                setTagsDirty(true);
              }}
              order={order}
              onOrderChange={setOrder}
              suggestionCandidates={suggestions.candidates}
              suggestionLoading={suggestions.loading}
              suggestionError={suggestions.error}
              onPickSuggestion={applyCandidate}
            />

            <DetectionRulesEditor
              isDetectMode={isDetectMode}
              detectRuleSet={detectRuleSet}
              keywordRules={keywordRules}
              patternRules={patternRules}
              saving={saving}
              addKeywordRule={addKeywordRule}
              updateKeywordRule={updateKeywordRule}
              removeKeywordRule={removeKeywordRule}
              addPatternRule={addPatternRule}
              updatePatternRule={updatePatternRule}
              updatePatternRuleCaseSensitivity={updatePatternRuleCaseSensitivity}
              removePatternRule={removePatternRule}
            />
          </div>

          <AssignmentPreviewList
            effectiveRows={effectiveRows}
            rows={rows}
            isDetectMode={isDetectMode}
            detectionCount={detectionCount}
            customRuleCount={customRuleCount}
            sampleCount={sampleCount}
            detectRules={detectRuleSet.rules}
            overrides={overrides}
            pendingDeleteId={pendingDeleteId}
            deletingId={deletingId}
            busy={busy}
            onRowOverride={handleRowOverride}
            onBeginDeletePreviewItem={beginDeletePreviewItem}
            onCancelDeletePreviewItem={cancelDeletePreviewItem}
            onConfirmDeletePreviewItem={confirmDeletePreviewItem}
          />

          <AssignProgressStatus saving={saving} assignProgress={assignProgress} />

          {error ? <p className="metadata-modal-error">{error}</p> : null}

          <footer className="metadata-modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="accent-button"
              disabled={
                busy ||
                workingItems.length === 0 ||
                (isDetectMode && detectRuleSet.errors.length > 0)
              }
            >
              {saving
                ? 'Assigning…'
                : workingItems.length === 0
                  ? 'No Episodes To Assign'
                  : `Assign ${workingItems.length} Episodes`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
