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

function normalizedInteger(value: unknown, minimum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum
    ? Math.floor(value)
    : null;
}

function persistedKeywordMappings(rules: FilenameParseRules) {
  return (rules.keywordMappings ?? []).flatMap((rule) => {
    const keyword = rule.keyword.trim();
    const seasonNumber = normalizedInteger(rule.seasonNumber, -1);
    const episodeNumber = normalizedInteger(rule.episodeNumber, 0);
    return keyword && (seasonNumber !== null || episodeNumber !== null)
      ? [{ keyword, seasonNumber, episodeNumber }]
      : [];
  });
}

function persistedPatternMappings(rules: FilenameParseRules) {
  return (rules.patternMappings ?? []).flatMap((rule) => {
    const pattern = rule.pattern.trim();
    const seasonGroup = normalizedInteger(rule.seasonGroup, 1);
    const episodeGroup = normalizedInteger(rule.episodeGroup, 1);
    const seasonNumber = normalizedInteger(rule.seasonNumber, -1);
    const episodeNumber = normalizedInteger(rule.episodeNumber, 0);
    const hasAssignment = seasonGroup !== null || episodeGroup !== null
      || seasonNumber !== null || episodeNumber !== null;
    if (!pattern || !hasAssignment) return [];
    const flags = sanitizeRuleFlags(rule.flags);
    return [{ pattern, flags: flags || undefined, seasonGroup, episodeGroup, seasonNumber, episodeNumber }];
  });
}

export function toPersistedSeriesAssignmentRules(
  rules: FilenameParseRules,
): SeriesAssignmentRules | null {
  const keywordMappings = persistedKeywordMappings(rules);
  const patternMappings = persistedPatternMappings(rules);

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

  const patternRules = (source.patternMappings ?? []).map(toPatternRuleDraft);

  return { keywordRules, patternRules };
}

function toPatternRuleDraft(rule: NonNullable<SeriesAssignmentRules['patternMappings']>[number]): PatternRuleDraft {
    const normalizedSeasonGroup = normalizedInteger(rule.seasonGroup, Number.MIN_SAFE_INTEGER);
    const normalizedEpisodeGroup = normalizedInteger(rule.episodeGroup, Number.MIN_SAFE_INTEGER);
    const normalizedFlags = sanitizeRuleFlags(rule.flags ?? '');
    const parsedGenerated = parseGeneratedLandmarkPattern(rule.pattern.trim());
    const canUseLandmarkBuilder = parsedGenerated !== null
      && matchesGeneratedGroup(normalizedSeasonGroup, parsedGenerated.seasonGroup)
      && matchesGeneratedGroup(normalizedEpisodeGroup, parsedGenerated.episodeGroup);

    return {
      id: createDraftId('pattern'),
      seasonLandmark: canUseLandmarkBuilder
        ? parsedGenerated.seasonLandmark
        : '',
      episodeLandmark: canUseLandmarkBuilder
        ? parsedGenerated.episodeLandmark
        : '',
      caseSensitive: !normalizedFlags.includes('i'),
      seasonNumber: finiteNumberString(rule.seasonNumber),
      episodeNumber: finiteNumberString(rule.episodeNumber),
      legacyPattern: canUseLandmarkBuilder ? null : rule.pattern,
      legacyFlags: canUseLandmarkBuilder ? '' : rule.flags ?? 'i',
      legacySeasonGroup: legacyGroupString(canUseLandmarkBuilder, normalizedSeasonGroup),
      legacyEpisodeGroup: legacyGroupString(canUseLandmarkBuilder, normalizedEpisodeGroup),
    };
}

function matchesGeneratedGroup(actual: number | null, generated: number | null): boolean {
  return actual === null || actual === generated;
}

function finiteNumberString(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function legacyGroupString(usingBuilder: boolean, value: number | null): string {
  return !usingBuilder && value !== null ? String(value) : '';
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
