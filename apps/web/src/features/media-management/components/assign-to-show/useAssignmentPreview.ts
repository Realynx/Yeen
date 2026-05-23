import { useMemo, useState } from 'react';
import type { FilenameParseRules } from '../../services/filenameParse';
import { buildAssignmentRows, rowsShareSeason } from './assignmentRows';
import type { AssignmentRow, EpisodeOrder } from './types';
import type { MediaItem } from '../../../shared/services/types';

export function useAssignmentPreview(
  workingItems: MediaItem[],
  order: EpisodeOrder,
  safeSeason: number,
  safeStart: number,
  detectRules: FilenameParseRules,
) {
  const rows = useMemo(
    () =>
      buildAssignmentRows(
        workingItems,
        order,
        safeSeason,
        safeStart,
        detectRules,
      ),
    [workingItems, order, safeSeason, safeStart, detectRules],
  );

  const [overrides, setOverrides] = useState<
    Record<string, { season: string; episode: string }>
  >({});

  const effectiveRows = useMemo(
    () =>
      rows.map((row) => {
        const override = overrides[row.item.id];
        if (!override) {
          return row;
        }

        const season = Number.parseInt(override.season, 10);
        const episode = Number.parseInt(override.episode, 10);
        return {
          ...row,
          seasonNumber:
            Number.isFinite(season) && season >= -1 ? season : row.seasonNumber,
          episodeNumber:
            Number.isFinite(episode) && episode >= 0 ? episode : row.episodeNumber,
        } as AssignmentRow;
      }),
    [rows, overrides],
  );

  const detectionCount = effectiveRows.filter((row) => row.detected).length;
  const customRuleCount = effectiveRows.filter(
    (row) => row.detectionSource === 'keyword' || row.detectionSource === 'pattern',
  ).length;
  const sampleCount = effectiveRows.filter(
    (row) => row.detectionSource === 'sample',
  ).length;
  const singleSeason = rowsShareSeason(effectiveRows);
  const isDetectMode = order === 'detect-from-filename';

  function handleRowOverride(
    itemId: string,
    field: 'season' | 'episode',
    value: string,
  ) {
    setOverrides((prev) => {
      const existing = prev[itemId];
      const baseRow = rows.find((entry) => entry.item.id === itemId);
      return {
        ...prev,
        [itemId]: {
          season: existing?.season ?? String(baseRow?.seasonNumber ?? 0),
          episode: existing?.episode ?? String(baseRow?.episodeNumber ?? 1),
          [field]: value,
        },
      };
    });
  }

  function removeOverridesForItem(itemId: string) {
    setOverrides((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, itemId)) {
        return prev;
      }

      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function resetOverrides() {
    setOverrides({});
  }

  return {
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
    resetOverrides,
  };
}
