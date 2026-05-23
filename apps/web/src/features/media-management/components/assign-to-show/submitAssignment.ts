import {
  bulkAssignEpisodes,
  updateMediaMetadata,
  type MediaMetadataPatch,
} from '../../../shared/services/api';
import type { SeriesAssignmentRules } from '../../../shared/services/types';
import type { AssignProgressState, AssignmentRow } from './types';

interface SubmitAssignmentParams {
  token: string;
  effectiveRows: AssignmentRow[];
  singleSeason: boolean;
  hasOverrides: boolean;
  cleanedTitle: string;
  safeSeason: number;
  safeStart: number;
  safeYear: number | null;
  shouldApplyTags: boolean;
  tags: string[];
  candidateDescription: string;
  candidatePosterUrl: string | null;
  candidateBackdropUrl: string | null;
  candidateRemoteSource: 'tmdb' | 'jikan' | null;
  candidateRemoteSourceId: string | null;
  seriesAssignmentRules: SeriesAssignmentRules | null;
  setAssignProgress: (
    next:
      | AssignProgressState
      | ((current: AssignProgressState) => AssignProgressState),
  ) => void;
}

export async function submitAssignment(
  params: SubmitAssignmentParams,
): Promise<number> {
  const {
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
  } = params;

  const hasDescriptionOverride = candidateDescription.length > 0;
  const hasArtworkOverride = Boolean(candidatePosterUrl || candidateBackdropUrl);
  const hasRemoteOverride = Boolean(
    candidateRemoteSource && candidateRemoteSourceId,
  );
  const hasMetadataOverride =
    hasArtworkOverride || hasRemoteOverride || hasDescriptionOverride;

  if (singleSeason && !hasOverrides && !hasMetadataOverride) {
    setAssignProgress((prev) => ({
      ...prev,
      mode: 'bulk',
      phase: 'assigning',
    }));
    await bulkAssignEpisodes(token, {
      mediaIds: effectiveRows.map((row) => row.item.id),
      title: cleanedTitle,
      type: 'show',
      seasonNumber: effectiveRows[0]?.seasonNumber ?? safeSeason,
      startEpisodeNumber: effectiveRows[0]?.episodeNumber ?? safeStart,
      episodeOrder: 'as-provided',
      tags: shouldApplyTags ? tags : undefined,
      releaseYear: safeYear ?? undefined,
      seriesAssignmentRules,
    });
    setAssignProgress((prev) => ({
      ...prev,
      phase: 'finalizing',
    }));
    return effectiveRows.length;
  }

  setAssignProgress({
    mode: 'per-item',
    phase: 'assigning',
    total: effectiveRows.length,
    completed: 0,
    currentPath: null,
  });

  const concurrency = 6;
  const queue = [...effectiveRows];
  let updated = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const row = queue.shift();
        if (!row) {
          return;
        }

        setAssignProgress((prev) => ({
          ...prev,
          currentPath: row.item.relativePath,
        }));

        const patch: MediaMetadataPatch = {
          title: cleanedTitle,
          type: 'show',
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          seriesAssignmentRules,
        };

        if (safeYear !== null) {
          patch.releaseYear = safeYear;
        }

        if (shouldApplyTags) {
          patch.tags = tags;
        }

        if (hasDescriptionOverride) {
          patch.description = candidateDescription;
        }

        if (candidatePosterUrl) {
          patch.posterUrl = candidatePosterUrl;
        }

        if (candidateBackdropUrl) {
          patch.backdropUrl = candidateBackdropUrl;
        }

        if (candidateRemoteSource && candidateRemoteSourceId) {
          patch.remoteSource = candidateRemoteSource;
          patch.remoteSourceId = candidateRemoteSourceId;
        }

        await updateMediaMetadata(token, row.item.id, patch);
        updated += 1;
        setAssignProgress((prev) => ({
          ...prev,
          completed: Math.min(prev.total, prev.completed + 1),
        }));
      }
    },
  );

  await Promise.all(workers);
  setAssignProgress((prev) => ({
    ...prev,
    phase: 'finalizing',
    completed: prev.total,
  }));

  return updated;
}
