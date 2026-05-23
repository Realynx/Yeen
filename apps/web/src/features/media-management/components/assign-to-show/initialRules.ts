import type { FilenameParseRules } from '../../services/filenameParse';
import type { MediaItem, SeriesAssignmentRules } from '../../../shared/services/types';
import { createDraftId, parseGeneratedLandmarkPattern, sanitizeRuleFlags } from './detectRules';
import type { KeywordRuleDraft, PatternRuleDraft } from './types';

export function hasPersistedSeriesRules(
  rules: SeriesAssignmentRules | null | undefined,
): rules is SeriesAssignmentRules {
  if (!rules) {
    return false;
  }

  return (
    (Array.isArray(rules.keywordMappings) && rules.keywordMappings.length > 0) ||
    (Array.isArray(rules.patternMappings) && rules.patternMappings.length > 0)
  );
}

export function toPersistedSeriesAssignmentRules(
  rules: FilenameParseRules,
): SeriesAssignmentRules | null {
  const keywordMappings: NonNullable<SeriesAssignmentRules['keywordMappings']> =
    [];

  if (Array.isArray(rules.keywordMappings)) {
    for (const rule of rules.keywordMappings) {
      const keyword = rule.keyword.trim();
      if (!keyword) {
        continue;
      }

      const seasonNumber =
        typeof rule.seasonNumber === 'number' &&
        Number.isFinite(rule.seasonNumber) &&
        rule.seasonNumber >= -1
          ? Math.floor(rule.seasonNumber)
          : null;
      const episodeNumber =
        typeof rule.episodeNumber === 'number' &&
        Number.isFinite(rule.episodeNumber) &&
        rule.episodeNumber >= 0
          ? Math.floor(rule.episodeNumber)
          : null;

      if (seasonNumber === null && episodeNumber === null) {
        continue;
      }

      keywordMappings.push({
        keyword,
        seasonNumber,
        episodeNumber,
      });
    }
  }

  const patternMappings: NonNullable<SeriesAssignmentRules['patternMappings']> =
    [];

  if (Array.isArray(rules.patternMappings)) {
    for (const rule of rules.patternMappings) {
      const pattern = rule.pattern.trim();
      if (!pattern) {
        continue;
      }

      const seasonGroup =
        typeof rule.seasonGroup === 'number' &&
        Number.isFinite(rule.seasonGroup) &&
        rule.seasonGroup >= 1
          ? Math.floor(rule.seasonGroup)
          : null;
      const episodeGroup =
        typeof rule.episodeGroup === 'number' &&
        Number.isFinite(rule.episodeGroup) &&
        rule.episodeGroup >= 1
          ? Math.floor(rule.episodeGroup)
          : null;
      const seasonNumber =
        typeof rule.seasonNumber === 'number' &&
        Number.isFinite(rule.seasonNumber) &&
        rule.seasonNumber >= -1
          ? Math.floor(rule.seasonNumber)
          : null;
      const episodeNumber =
        typeof rule.episodeNumber === 'number' &&
        Number.isFinite(rule.episodeNumber) &&
        rule.episodeNumber >= 0
          ? Math.floor(rule.episodeNumber)
          : null;

      if (
        seasonGroup === null &&
        episodeGroup === null &&
        seasonNumber === null &&
        episodeNumber === null
      ) {
        continue;
      }

      const flags = sanitizeRuleFlags(rule.flags);

      patternMappings.push({
        pattern,
        flags: flags || undefined,
        seasonGroup,
        episodeGroup,
        seasonNumber,
        episodeNumber,
      });
    }
  }

  if (keywordMappings.length === 0 && patternMappings.length === 0) {
    return null;
  }

  return {
    keywordMappings,
    patternMappings,
  };
}

export function initialRuleDraftsFromSelection(items: MediaItem[]): {
  keywordRules: KeywordRuleDraft[];
  patternRules: PatternRuleDraft[];
} {
  const source = items
    .map((item) => item.seriesAssignmentRules)
    .find((entry) => hasPersistedSeriesRules(entry));

  if (!source) {
    return {
      keywordRules: [],
      patternRules: [],
    };
  }

  const keywordRules = (source.keywordMappings ?? []).map((rule) => ({
    id: createDraftId('kw'),
    keyword: rule.keyword,
    seasonNumber:
      typeof rule.seasonNumber === 'number' && Number.isFinite(rule.seasonNumber)
        ? String(rule.seasonNumber)
        : '',
    episodeNumber:
      typeof rule.episodeNumber === 'number' && Number.isFinite(rule.episodeNumber)
        ? String(rule.episodeNumber)
        : '',
  }));

  const patternRules = (source.patternMappings ?? []).map((rule) => {
    const normalizedSeasonGroup =
      typeof rule.seasonGroup === 'number' && Number.isFinite(rule.seasonGroup)
        ? Math.floor(rule.seasonGroup)
        : null;
    const normalizedEpisodeGroup =
      typeof rule.episodeGroup === 'number' && Number.isFinite(rule.episodeGroup)
        ? Math.floor(rule.episodeGroup)
        : null;
    const normalizedFlags = sanitizeRuleFlags(rule.flags ?? '');
    const parsedGenerated = parseGeneratedLandmarkPattern(rule.pattern.trim());
    const canUseLandmarkBuilder =
      parsedGenerated !== null &&
      (normalizedSeasonGroup === null ||
        normalizedSeasonGroup === parsedGenerated.seasonGroup) &&
      (normalizedEpisodeGroup === null ||
        normalizedEpisodeGroup === parsedGenerated.episodeGroup);

    return {
      id: createDraftId('pattern'),
      seasonLandmark: canUseLandmarkBuilder
        ? parsedGenerated.seasonLandmark
        : '',
      episodeLandmark: canUseLandmarkBuilder
        ? parsedGenerated.episodeLandmark
        : '',
      caseSensitive: !normalizedFlags.includes('i'),
      seasonNumber:
        typeof rule.seasonNumber === 'number' && Number.isFinite(rule.seasonNumber)
          ? String(rule.seasonNumber)
          : '',
      episodeNumber:
        typeof rule.episodeNumber === 'number' && Number.isFinite(rule.episodeNumber)
          ? String(rule.episodeNumber)
          : '',
      legacyPattern: canUseLandmarkBuilder ? null : rule.pattern,
      legacyFlags: canUseLandmarkBuilder ? '' : rule.flags ?? 'i',
      legacySeasonGroup:
        !canUseLandmarkBuilder && normalizedSeasonGroup !== null
          ? String(normalizedSeasonGroup)
          : '',
      legacyEpisodeGroup:
        !canUseLandmarkBuilder && normalizedEpisodeGroup !== null
          ? String(normalizedEpisodeGroup)
          : '',
    };
  });

  return {
    keywordRules,
    patternRules,
  };
}

function normalizeTagsForInput(
  tags: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

function toMediaTimestamp(item: MediaItem): number {
  const refreshedAt = Date.parse(item.metadataRefreshedAt);
  const updatedAt = Date.parse(item.updatedAt);
  const refreshed = Number.isFinite(refreshedAt) ? refreshedAt : 0;
  const updated = Number.isFinite(updatedAt) ? updatedAt : 0;
  return Math.max(refreshed, updated);
}

export function initialTagsInputFromSelection(items: MediaItem[]): string {
  const candidate = [...items].sort((left, right) => {
    const rightCount = Array.isArray(right.tags) ? right.tags.length : 0;
    const leftCount = Array.isArray(left.tags) ? left.tags.length : 0;
    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }

    return toMediaTimestamp(right) - toMediaTimestamp(left);
  })[0];

  return normalizeTagsForInput(candidate?.tags ?? []).join(', ');
}
