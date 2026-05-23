import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  bulkDeleteMediaPermanently,
  bulkAssignEpisodes,
  toApiErrorMessage,
  updateMediaMetadata,
  type MediaMetadataPatch,
  type MetadataSearchCandidate,
} from '../lib/api';
import {
  detectSeasonEpisodeFromPath,
  type FilenameKeywordMappingRule,
  type FilenameParseRules,
  type FilenamePatternMappingRule,
} from '../lib/filename-parse';
import { useMetadataSuggestions } from '../lib/use-metadata-suggestions';
import type { MediaItem, SeriesAssignmentRules } from '../lib/types';
import { MetadataSuggestionList } from './MetadataSuggestionList';

interface AssignToShowDialogProps {
  token: string;
  selectedItems: MediaItem[];
  onClose: () => void;
  onAssigned: (count: number) => void;
}

type EpisodeOrder =
  | 'detect-from-filename'
  | 'filename-asc'
  | 'existing-episode'
  | 'as-provided';

type AssignmentDetectionSource =
  | 'builtin'
  | 'pattern'
  | 'keyword'
  | 'sample'
  | 'existing'
  | 'sequential';

interface KeywordRuleDraft {
  id: string;
  keyword: string;
  seasonNumber: string;
  episodeNumber: string;
}

interface PatternRuleDraft {
  id: string;
  seasonLandmark: string;
  episodeLandmark: string;
  caseSensitive: boolean;
  seasonNumber: string;
  episodeNumber: string;
  legacyPattern: string | null;
  legacyFlags: string;
  legacySeasonGroup: string;
  legacyEpisodeGroup: string;
}

interface AssignProgressState {
  mode: 'idle' | 'bulk' | 'per-item';
  phase: 'preparing' | 'assigning' | 'finalizing';
  total: number;
  completed: number;
  currentPath: string | null;
}

interface AssignmentRow {
  item: MediaItem;
  seasonNumber: number;
  episodeNumber: number;
  detected: boolean;
  detectionSource: AssignmentDetectionSource;
  matchedPattern: string | null;
  matchedKeyword: string | null;
}

interface DetectRuleBuildResult {
  rules: FilenameParseRules;
  keywordRuleCount: number;
  patternRuleCount: number;
  errors: string[];
}

function createDraftId(prefix: 'kw' | 'pattern'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function parseOptionalSeasonIntInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < -1) {
    return null;
  }

  return parsed;
}

function parseOptionalNonNegativeIntInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseOptionalPositiveIntInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function sanitizeRuleFlags(rawFlags?: string | null): string {
  if (typeof rawFlags !== 'string' || !rawFlags.trim()) {
    return '';
  }

  const allowed = new Set(['i', 'm', 's', 'u']);
  const deduped = new Set<string>();
  for (const char of rawFlags.toLowerCase()) {
    if (allowed.has(char)) {
      deduped.add(char);
    }
  }

  return [...deduped].join('');
}

const LANDMARK_SEASON_CAPTURE = '\\s*([0-9]{1,3})';
const LANDMARK_EPISODE_CAPTURE = '\\s*([0-9]{1,4})';
const LANDMARK_SEPARATOR = '[\\s._-]*';

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unescapeRegexLiteral(value: string): string {
  return value.replace(/\\([.*+?^${}()|[\]\\])/g, '$1');
}

function buildLandmarkPattern(
  seasonLandmark: string,
  episodeLandmark: string,
): {
  pattern: string;
  seasonGroup: number | null;
  episodeGroup: number | null;
} | null {
  const season = seasonLandmark.trim();
  const episode = episodeLandmark.trim();

  if (!season && !episode) {
    return null;
  }

  let pattern = '';
  let seasonGroup: number | null = null;
  let episodeGroup: number | null = null;

  if (season) {
    pattern += `${escapeRegexLiteral(season)}${LANDMARK_SEASON_CAPTURE}`;
    seasonGroup = 1;
  }

  if (episode) {
    if (season) {
      pattern += LANDMARK_SEPARATOR;
      episodeGroup = 2;
    } else {
      episodeGroup = 1;
    }
    pattern += `${escapeRegexLiteral(episode)}${LANDMARK_EPISODE_CAPTURE}`;
  }

  return {
    pattern,
    seasonGroup,
    episodeGroup,
  };
}

function parseGeneratedLandmarkPattern(
  pattern: string,
): {
  seasonLandmark: string;
  episodeLandmark: string;
  seasonGroup: number | null;
  episodeGroup: number | null;
} | null {
  const seasonCaptureIndex = pattern.indexOf(LANDMARK_SEASON_CAPTURE);
  const episodeCaptureIndex = pattern.indexOf(LANDMARK_EPISODE_CAPTURE);

  if (seasonCaptureIndex >= 0 && episodeCaptureIndex >= 0) {
    const seasonLiteral = pattern.slice(0, seasonCaptureIndex);
    const afterSeason = pattern.slice(
      seasonCaptureIndex + LANDMARK_SEASON_CAPTURE.length,
    );
    const trailingEpisodeCaptureIndex =
      afterSeason.lastIndexOf(LANDMARK_EPISODE_CAPTURE);
    if (trailingEpisodeCaptureIndex < 0) {
      return null;
    }

    const between = afterSeason.slice(0, trailingEpisodeCaptureIndex);
    const trailing = afterSeason.slice(
      trailingEpisodeCaptureIndex + LANDMARK_EPISODE_CAPTURE.length,
    );
    if (!between.startsWith(LANDMARK_SEPARATOR) || trailing.length > 0) {
      return null;
    }

    const episodeLiteral = between.slice(LANDMARK_SEPARATOR.length);
    return {
      seasonLandmark: unescapeRegexLiteral(seasonLiteral),
      episodeLandmark: unescapeRegexLiteral(episodeLiteral),
      seasonGroup: 1,
      episodeGroup: 2,
    };
  }

  if (seasonCaptureIndex >= 0 && episodeCaptureIndex < 0) {
    const seasonLiteral = pattern.slice(0, seasonCaptureIndex);
    const trailing = pattern.slice(
      seasonCaptureIndex + LANDMARK_SEASON_CAPTURE.length,
    );
    if (trailing.length > 0) {
      return null;
    }

    return {
      seasonLandmark: unescapeRegexLiteral(seasonLiteral),
      episodeLandmark: '',
      seasonGroup: 1,
      episodeGroup: null,
    };
  }

  if (seasonCaptureIndex < 0 && episodeCaptureIndex >= 0) {
    const episodeLiteral = pattern.slice(0, episodeCaptureIndex);
    const trailing = pattern.slice(
      episodeCaptureIndex + LANDMARK_EPISODE_CAPTURE.length,
    );
    if (trailing.length > 0) {
      return null;
    }

    return {
      seasonLandmark: '',
      episodeLandmark: unescapeRegexLiteral(episodeLiteral),
      seasonGroup: null,
      episodeGroup: 1,
    };
  }

  return null;
}

function formatPatternRulePreview(rule: PatternRuleDraft): string {
  const built = buildLandmarkPattern(rule.seasonLandmark, rule.episodeLandmark);
  if (built) {
    const flags = rule.caseSensitive ? '' : 'i';
    return `/${built.pattern}/${flags}`;
  }

  const legacyPattern = rule.legacyPattern?.trim() ?? '';
  if (legacyPattern) {
    const flags = sanitizeRuleFlags(rule.legacyFlags);
    return `/${legacyPattern}/${flags}`;
  }

  return 'Add a season or episode landmark to generate a pattern.';
}

function buildDetectRuleSet(
  keywordDrafts: KeywordRuleDraft[],
  patternDrafts: PatternRuleDraft[],
): DetectRuleBuildResult {
  const keywordMappings: FilenameKeywordMappingRule[] = [];
  const patternMappings: FilenamePatternMappingRule[] = [];
  const errors: string[] = [];

  for (const draft of keywordDrafts) {
    const keyword = draft.keyword.trim();
    if (!keyword) {
      continue;
    }

    const seasonNumber = parseOptionalSeasonIntInput(draft.seasonNumber);
    const episodeNumber = parseOptionalNonNegativeIntInput(draft.episodeNumber);

    if (seasonNumber === null && episodeNumber === null) {
      errors.push(
        `Keyword rule "${keyword}" must define season and/or episode.`,
      );
      continue;
    }

    keywordMappings.push({
      keyword,
      seasonNumber,
      episodeNumber,
    });
  }

  for (const draft of patternDrafts) {
    const seasonLandmark = draft.seasonLandmark.trim();
    const episodeLandmark = draft.episodeLandmark.trim();
    const builtPattern = buildLandmarkPattern(seasonLandmark, episodeLandmark);

    let pattern = '';
    let flags = '';
    let seasonGroup: number | null = null;
    let episodeGroup: number | null = null;
    let descriptor = 'pattern rule';

    if (builtPattern) {
      pattern = builtPattern.pattern;
      seasonGroup = builtPattern.seasonGroup;
      episodeGroup = builtPattern.episodeGroup;
      flags = draft.caseSensitive ? '' : 'i';
      descriptor = `landmark rule "${seasonLandmark || 'season n/a'} / ${episodeLandmark || 'episode n/a'}"`;
    } else {
      const legacyPattern = draft.legacyPattern?.trim() ?? '';
      if (!legacyPattern) {
        if (draft.seasonNumber.trim() || draft.episodeNumber.trim()) {
          errors.push(
            'Pattern landmark rules need season and/or episode landmark text before fixed values can be applied.',
          );
        }
        continue;
      }

      pattern = legacyPattern;
      flags = sanitizeRuleFlags(draft.legacyFlags);
      seasonGroup = parseOptionalPositiveIntInput(draft.legacySeasonGroup);
      episodeGroup = parseOptionalPositiveIntInput(draft.legacyEpisodeGroup);
      descriptor = `legacy regex rule "${legacyPattern}"`;
    }

    try {
      // Validate generated/preserved regex ahead of detection to surface clear errors.
      RegExp(pattern, flags);
    } catch {
      errors.push(`${descriptor} is not a valid pattern.`);
      continue;
    }

    const seasonNumber = parseOptionalSeasonIntInput(draft.seasonNumber);
    const episodeNumber = parseOptionalNonNegativeIntInput(draft.episodeNumber);

    if (
      seasonGroup === null &&
      episodeGroup === null &&
      seasonNumber === null &&
      episodeNumber === null
    ) {
      errors.push(
        `${descriptor} needs a captured season/episode or fixed season/episode value.`,
      );
      continue;
    }

    patternMappings.push({
      pattern,
      flags: flags || undefined,
      seasonGroup,
      episodeGroup,
      seasonNumber,
      episodeNumber,
    });
  }

  return {
    rules: {
      keywordMappings,
      patternMappings,
    },
    keywordRuleCount: keywordMappings.length,
    patternRuleCount: patternMappings.length,
    errors,
  };
}

function createIdleProgressState(): AssignProgressState {
  return {
    mode: 'idle',
    phase: 'preparing',
    total: 0,
    completed: 0,
    currentPath: null,
  };
}

function hasPersistedSeriesRules(
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

function toPersistedSeriesAssignmentRules(
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

function initialRuleDraftsFromSelection(items: MediaItem[]): {
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

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortItems(items: MediaItem[], order: EpisodeOrder): MediaItem[] {
  if (order === 'as-provided') {
    return [...items];
  }

  if (order === 'existing-episode') {
    return [...items].sort((left, right) => {
      const ls = left.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      const rs = right.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      if (ls !== rs) return ls - rs;
      const le = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const re = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (le !== re) return le - re;
      return naturalCompare(left.relativePath, right.relativePath);
    });
  }

  // detect-from-filename and filename-asc both start from a natural sort
  // on relative path so detected episodes group cleanly per season.
  return [...items].sort((left, right) =>
    naturalCompare(left.relativePath, right.relativePath),
  );
}

function buildAssignmentRows(
  items: MediaItem[],
  order: EpisodeOrder,
  defaultSeason: number,
  startEpisode: number,
  detectRules: FilenameParseRules,
): AssignmentRow[] {
  const sorted = sortItems(items, order);
  const sampleDurationMaxSeconds = 4 * 60;

  if (order === 'detect-from-filename') {
    const rows: AssignmentRow[] = [];
    // Per-season counters for items where detection failed — these are
    // numbered after the highest detected episode for that season so
    // sequential fallback numbers can't collide with explicit ones.
    const fallbackPerSeason = new Map<number, number>();
    const highestPerSeason = new Map<number, number>();
    let sampleEpisodeNumber = 1;

    const detections = sorted.map((item) => {
      const isLikelySample =
        item.durationSeconds > 0 && item.durationSeconds <= sampleDurationMaxSeconds;
      if (isLikelySample) {
        return {
          item,
          season: -1,
          episode: null,
          parsed: null,
          isLikelySample,
        };
      }

      const parsed = detectSeasonEpisodeFromPath(item.relativePath, detectRules);
      const season = parsed.seasonNumber ?? defaultSeason;
      const episode = parsed.episodeNumber ?? null;
      if (episode !== null) {
        const prev = highestPerSeason.get(season) ?? 0;
        if (episode > prev) highestPerSeason.set(season, episode);
      }
      return { item, season, episode, parsed, isLikelySample };
    });

    for (const { item, season, episode, parsed, isLikelySample } of detections) {
      if (isLikelySample) {
        rows.push({
          item,
          seasonNumber: -1,
          episodeNumber: sampleEpisodeNumber,
          detected: true,
          detectionSource: 'sample',
          matchedPattern: null,
          matchedKeyword: null,
        });
        sampleEpisodeNumber += 1;
        continue;
      }

      if (!parsed) {
        continue;
      }

      if (episode !== null) {
        rows.push({
          item,
          seasonNumber: season,
          episodeNumber: episode,
          detected: true,
          detectionSource:
            parsed.source === 'pattern'
              ? 'pattern'
              : parsed.source === 'keyword'
              ? 'keyword'
              : 'builtin',
          matchedPattern: parsed.matchedPattern,
          matchedKeyword: parsed.matchedKeyword,
        });
        continue;
      }
      const seed =
        fallbackPerSeason.get(season) ??
        Math.max(highestPerSeason.get(season) ?? 0, startEpisode - 1);
      const next = seed + 1;
      fallbackPerSeason.set(season, next);
      rows.push({
        item,
        seasonNumber: season,
        episodeNumber: next,
        detected: false,
        detectionSource:
          parsed.source === 'pattern'
            ? 'pattern'
            : parsed.source === 'keyword'
            ? 'keyword'
            : 'sequential',
        matchedPattern: parsed.matchedPattern,
        matchedKeyword: parsed.matchedKeyword,
      });
    }

    return rows;
  }

  if (order === 'existing-episode') {
    let fallbackEpisode = startEpisode;
    return sorted.map((item) => {
      const season = item.seasonNumber ?? defaultSeason;
      const episode = item.episodeNumber ?? fallbackEpisode++;
      return {
        item,
        seasonNumber: season,
        episodeNumber: episode,
        detected: item.episodeNumber !== null,
        detectionSource: 'existing',
        matchedPattern: null,
        matchedKeyword: null,
      };
    });
  }

  // filename-asc / as-provided: sequential under the default season.
  return sorted.map((item, index) => ({
    item,
    seasonNumber: defaultSeason,
    episodeNumber: startEpisode + index,
    detected: false,
    detectionSource: 'sequential',
    matchedPattern: null,
    matchedKeyword: null,
  }));
}

function rowsShareSeason(rows: AssignmentRow[]): boolean {
  if (rows.length === 0) return true;
  const first = rows[0].seasonNumber;
  return rows.every((row) => row.seasonNumber === first);
}

function detectionBadgeLabel(row: AssignmentRow): string {
  switch (row.detectionSource) {
    case 'pattern':
      return 'Pattern';
    case 'keyword':
      return 'Keyword';
    case 'sample':
      return 'Sample';
    case 'builtin':
      return 'Detected';
    case 'existing':
      return 'Existing';
    default:
      return 'Sequential';
  }
}

function detectionTitle(row: AssignmentRow): string {
  if (row.detectionSource === 'pattern') {
    return row.matchedPattern
      ? `Matched custom pattern: ${row.matchedPattern}`
      : 'Matched custom pattern';
  }

  if (row.detectionSource === 'keyword') {
    return row.matchedKeyword
      ? `Matched keyword mapping: ${row.matchedKeyword}`
      : 'Matched keyword mapping';
  }

  if (row.detectionSource === 'builtin') {
    return 'Detected from filename';
  }

  if (row.detectionSource === 'sample') {
    return 'Likely sample clip (4 minutes or less). Auto-assigned to season -1.';
  }

  if (row.detectionSource === 'existing') {
    return 'Used existing season/episode values';
  }

  return 'Sequential fallback';
}

function findPatternMatchText(
  relativePath: string,
  row: AssignmentRow,
  rules: FilenameParseRules,
): string | null {
  if (row.detectionSource !== 'pattern' || !row.matchedPattern) {
    return null;
  }

  const mapping = rules.patternMappings?.find(
    (entry) => entry.pattern === row.matchedPattern,
  );
  const flags = sanitizeRuleFlags(mapping?.flags ?? '');

  try {
    const regex = new RegExp(row.matchedPattern, flags);
    const fromPath = regex.exec(relativePath)?.[0] ?? null;
    if (fromPath) {
      return fromPath;
    }

    const fileName = relativePath.split(/[/\\]/).pop() ?? relativePath;
    return regex.exec(fileName)?.[0] ?? null;
  } catch {
    return null;
  }
}

function findBuiltinMatchText(relativePath: string): string | null {
  const candidates = [relativePath, relativePath.split(/[/\\]/).pop() ?? relativePath];
  const patterns = [
    /s\d{1,2}[\s._-]?e\d{1,3}/i,
    /\b\d{1,2}x\d{1,3}\b/i,
    /season[\s._-]*\d{1,2}[\s._-]+episode[\s._-]*\d{1,3}/i,
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*\d{1,3}\b/i,
    /[\s._]-[\s._](\d{1,4})(?:v\d+)?(?:[\s._-]|$)/,
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const matched = pattern.exec(candidate)?.[0] ?? null;
      if (matched) {
        return matched;
      }
    }
  }

  return null;
}

function findPathHighlightText(
  row: AssignmentRow,
  rules: FilenameParseRules,
): string | null {
  if (!row.detected && row.detectionSource !== 'existing') {
    return null;
  }

  if (row.detectionSource === 'keyword' && row.matchedKeyword) {
    const loweredPath = row.item.relativePath.toLowerCase();
    const loweredKeyword = row.matchedKeyword.toLowerCase();
    const index = loweredPath.indexOf(loweredKeyword);
    if (index >= 0) {
      return row.item.relativePath.slice(index, index + row.matchedKeyword.length);
    }

    return row.matchedKeyword;
  }

  if (row.detectionSource === 'pattern') {
    return findPatternMatchText(row.item.relativePath, row, rules);
  }

  if (row.detectionSource === 'sample') {
    const sampleTokenMatch = /(sample|trailer|preview)/i.exec(row.item.relativePath);
    return sampleTokenMatch?.[0] ?? null;
  }

  if (row.detectionSource === 'builtin') {
    return findBuiltinMatchText(row.item.relativePath);
  }

  return null;
}

function renderHighlightedPath(
  row: AssignmentRow,
  rules: FilenameParseRules,
): ReactNode {
  const relativePath = row.item.relativePath;
  const highlight = findPathHighlightText(row, rules);
  if (!highlight) {
    if (row.detected && row.detectionSource !== 'sequential') {
      return (
        <span className="metadata-preview-path-highlight is-fallback">
          {relativePath}
        </span>
      );
    }

    return relativePath;
  }

  const loweredPath = relativePath.toLowerCase();
  const loweredHighlight = highlight.toLowerCase();
  const start = loweredPath.indexOf(loweredHighlight);
  if (start < 0) {
    return relativePath;
  }

  const end = start + highlight.length;
  return (
    <>
      {relativePath.slice(0, start)}
      <span className="metadata-preview-path-highlight">{relativePath.slice(start, end)}</span>
      {relativePath.slice(end)}
    </>
  );
}

function normalizeTagsForInput(tags: readonly string[] | null | undefined): string[] {
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

function initialTagsInputFromSelection(items: MediaItem[]): string {
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
  const [candidateReleaseYear, setCandidateReleaseYear] = useState<number | null>(null);
  const [tagsInput, setTagsInput] = useState(initialTagsInput);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [candidateOverview, setCandidateOverview] = useState<string | null>(null);
  const [candidatePosterUrl, setCandidatePosterUrl] = useState<string | null>(null);
  const [candidateBackdropUrl, setCandidateBackdropUrl] = useState<string | null>(null);
  const [candidateRemoteSource, setCandidateRemoteSource] = useState<'tmdb' | 'jikan' | null>(null);
  const [candidateRemoteSourceId, setCandidateRemoteSourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keywordRules, setKeywordRules] = useState<KeywordRuleDraft[]>(
    () => initialRuleDrafts.keywordRules,
  );
  const [patternRules, setPatternRules] = useState<PatternRuleDraft[]>(
    () => initialRuleDrafts.patternRules,
  );
  const [assignProgress, setAssignProgress] =
    useState<AssignProgressState>(createIdleProgressState());

  const busy = saving || deletingId !== null;

  useEffect(() => {
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
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

  const safeSeason = 1;
  const safeStart = 1;
  const safeYear = candidateReleaseYear;

  const detectRuleSet = useMemo(
    () => buildDetectRuleSet(keywordRules, patternRules),
    [keywordRules, patternRules],
  );

  const rows = useMemo(
    () =>
      buildAssignmentRows(
        workingItems,
        order,
        safeSeason,
        safeStart,
        detectRuleSet.rules,
      ),
    [workingItems, order, safeSeason, safeStart, detectRuleSet.rules],
  );

  // Per-row manual overrides: sparse map keyed by item id.
  const [overrides, setOverrides] = useState<Record<string, { season: string; episode: string }>>({});

  // Computed rows with overrides applied on top.
  const effectiveRows = useMemo(
    () =>
      rows.map((row) => {
        const override = overrides[row.item.id];
        if (!override) return row;
        const season = Number.parseInt(override.season, 10);
        const episode = Number.parseInt(override.episode, 10);
        return {
          ...row,
          seasonNumber: Number.isFinite(season) && season >= -1 ? season : row.seasonNumber,
          episodeNumber: Number.isFinite(episode) && episode >= 0 ? episode : row.episodeNumber,
        };
      }),
    [rows, overrides],
  );

  function handleRowOverride(
    itemId: string,
    field: 'season' | 'episode',
    value: string,
  ) {
    setOverrides((prev) => {
      const existing = prev[itemId];
      const baseRow = rows.find((r) => r.item.id === itemId);
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

  function addKeywordRule() {
    setKeywordRules((prev) => [
      ...prev,
      {
        id: createDraftId('kw'),
        keyword: '',
        seasonNumber: '',
        episodeNumber: '',
      },
    ]);
  }

  function updateKeywordRule(
    id: string,
    field: 'keyword' | 'seasonNumber' | 'episodeNumber',
    value: string,
  ) {
    setKeywordRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
    );
  }

  function removeKeywordRule(id: string) {
    setKeywordRules((prev) => prev.filter((rule) => rule.id !== id));
  }

  function addPatternRule() {
    setPatternRules((prev) => [
      ...prev,
      {
        id: createDraftId('pattern'),
        seasonLandmark: 'S',
        episodeLandmark: 'E',
        caseSensitive: false,
        seasonNumber: '',
        episodeNumber: '',
        legacyPattern: null,
        legacyFlags: '',
        legacySeasonGroup: '',
        legacyEpisodeGroup: '',
      },
    ]);
  }

  function updatePatternRule(
    id: string,
    field:
      | 'seasonLandmark'
      | 'episodeLandmark'
      | 'seasonNumber'
      | 'episodeNumber',
    value: string,
  ) {
    setPatternRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== id) {
          return rule;
        }

        const next: PatternRuleDraft = { ...rule, [field]: value };
        if (
          field === 'seasonLandmark' ||
          field === 'episodeLandmark'
        ) {
          next.legacyPattern = null;
          next.legacyFlags = '';
          next.legacySeasonGroup = '';
          next.legacyEpisodeGroup = '';
        }

        return next;
      }),
    );
  }

  function updatePatternRuleCaseSensitivity(id: string, checked: boolean) {
    setPatternRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? { ...rule, caseSensitive: checked } : rule,
      ),
    );
  }

  function removePatternRule(id: string) {
    setPatternRules((prev) => prev.filter((rule) => rule.id !== id));
  }

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

  async function confirmDeletePreviewItem(row: AssignmentRow) {
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
      setOverrides((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, row.item.id)) {
          return prev;
        }

        const next = { ...prev };
        delete next[row.item.id];
        return next;
      });
      setPendingDeleteId(null);
    } catch (deleteError) {
      setError(
        toApiErrorMessage(deleteError, 'Failed to delete media item from assignment preview.'),
      );
    } finally {
      setDeletingId(null);
    }
  }

  const detectionCount = effectiveRows.filter((row) => row.detected).length;
  const customRuleCount = effectiveRows.filter(
    (row) => row.detectionSource === 'keyword' || row.detectionSource === 'pattern',
  ).length;
  const sampleCount = effectiveRows.filter(
    (row) => row.detectionSource === 'sample',
  ).length;
  const singleSeason = rowsShareSeason(effectiveRows);
  const isDetectMode = order === 'detect-from-filename';

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

  const suggestions = useMetadataSuggestions({
    token,
    title,
    type: 'show',
    year: safeYear,
  });

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
      const hasDescriptionOverride = candidateDescription.length > 0;
      const seriesAssignmentRules = toPersistedSeriesAssignmentRules(
        detectRuleSet.rules,
      );

      const hasOverrides = Object.keys(overrides).length > 0;
      const hasArtworkOverride = Boolean(candidatePosterUrl || candidateBackdropUrl);
      const hasRemoteOverride = Boolean(
        candidateRemoteSource && candidateRemoteSourceId,
      );
      const hasMetadataOverride =
        hasArtworkOverride || hasRemoteOverride || hasDescriptionOverride;
      if (singleSeason && !hasOverrides && !hasMetadataOverride) {
        // Fast path: identical season across all rows lets us use the
        // dedicated bulk endpoint instead of N PATCH calls.
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
        onAssigned(effectiveRows.length);
        return;
      }

      // Mixed seasons or per-row overrides: fan out per-item PATCH calls
      // with a small concurrency limit so we don't hammer the server.
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
            if (!row) return;
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
        <header className="metadata-modal-header">
          <div>
            <p className="metadata-modal-eyebrow">Assign to Series</p>
            <h2 id="assign-modal-title">
              {workingItems.length} {workingItems.length === 1 ? 'item' : 'items'} selected
            </h2>
            <p className="metadata-modal-path">
              {order === 'detect-from-filename'
                ? `Detected ${detectionCount} of ${rows.length} files from names; ${customRuleCount} used custom keyword/pattern rules and ${sampleCount} were flagged as sample clips (season -1). Unmatched files are numbered sequentially.`
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

        <form className="metadata-form" onSubmit={handleSubmit}>
          <div className="metadata-grid">
            <label className="metadata-field metadata-field-wide">
              <span>Show Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
              />
              <MetadataSuggestionList
                candidates={suggestions.candidates}
                loading={suggestions.loading}
                error={suggestions.error}
                onPick={applyCandidate}
              />
            </label>

            <label className="metadata-field metadata-field-wide">
              <span>Tags (comma separated)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => {
                  setTagsInput(event.target.value);
                  setTagsDirty(true);
                }}
                placeholder="anime, drama"
              />
            </label>

            <label className="metadata-field metadata-field-wide">
              <span>Episode Order</span>
              <select value={order} onChange={(event) => setOrder(event.target.value as EpisodeOrder)}>
                <option value="detect-from-filename">
                  Detect from filename (recommended)
                </option>
                <option value="filename-asc">Sort by filename (natural)</option>
                <option value="existing-episode">Use existing season/episode</option>
                <option value="as-provided">Selection order</option>
              </select>
            </label>

            {isDetectMode ? (
              <section className="metadata-detect-rules metadata-field-wide">
                <div className="metadata-detect-rules-header">
                  <p className="metadata-detect-rules-title">Detection Assist Rules</p>
                  <p className="metadata-field-hint">
                    Mix auto-detection with manual guidance. Overrides still work per item in every mode.
                  </p>
                  <p className="metadata-field-hint metadata-detect-rules-counts">
                    Active rules: {detectRuleSet.keywordRuleCount} keyword / {detectRuleSet.patternRuleCount} pattern
                  </p>
                </div>

                <div className="metadata-detect-rules-grid">
                  <article className="metadata-detect-card">
                    <header className="metadata-detect-card-header">
                      <h3>Keyword Mapping</h3>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={addKeywordRule}
                        disabled={saving}
                      >
                        Add Keyword
                      </button>
                    </header>
                    <p className="metadata-field-hint">
                      Example: keyword "sample" with season -1 auto-groups clips to ignored sample season.
                    </p>
                    <div className="metadata-detect-rule-list">
                      {keywordRules.length === 0 ? (
                        <p className="metadata-detect-empty">No keyword rules yet.</p>
                      ) : (
                        keywordRules.map((rule) => (
                          <div key={rule.id} className="metadata-detect-rule-row">
                            <input
                              type="text"
                              value={rule.keyword}
                              onChange={(event) =>
                                updateKeywordRule(rule.id, 'keyword', event.target.value)
                              }
                              placeholder="keyword"
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              value={rule.seasonNumber}
                              onChange={(event) =>
                                updateKeywordRule(rule.id, 'seasonNumber', event.target.value)
                              }
                              placeholder="season"
                              min={-1}
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              value={rule.episodeNumber}
                              onChange={(event) =>
                                updateKeywordRule(rule.id, 'episodeNumber', event.target.value)
                              }
                              placeholder="episode"
                              min={0}
                            />
                            <button
                              type="button"
                              className="metadata-detect-remove"
                              onClick={() => removeKeywordRule(rule.id)}
                              disabled={saving}
                              aria-label="Remove keyword rule"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </article>

                  <article className="metadata-detect-card">
                    <header className="metadata-detect-card-header">
                      <h3>Pattern Builder</h3>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={addPatternRule}
                        disabled={saving}
                      >
                        Add Landmark Rule
                      </button>
                    </header>
                    <p className="metadata-field-hint">
                      Enter the text that appears before season and episode numbers. We generate the regex for you.
                    </p>
                    <div className="metadata-detect-rule-list">
                      {patternRules.length === 0 ? (
                        <p className="metadata-detect-empty">No landmark rules yet.</p>
                      ) : (
                        patternRules.map((rule) => (
                          <div key={rule.id} className="metadata-detect-pattern-row">
                            <div className="metadata-detect-pattern-builder-main">
                              <input
                                type="text"
                                value={rule.seasonLandmark}
                                onChange={(event) =>
                                  updatePatternRule(
                                    rule.id,
                                    'seasonLandmark',
                                    event.target.value,
                                  )
                                }
                                placeholder="season landmark (e.g. S, Season)"
                              />
                              <input
                                type="text"
                                value={rule.episodeLandmark}
                                onChange={(event) =>
                                  updatePatternRule(
                                    rule.id,
                                    'episodeLandmark',
                                    event.target.value,
                                  )
                                }
                                placeholder="episode landmark (e.g. E, Episode)"
                              />
                            </div>
                            <div className="metadata-detect-pattern-builder-meta">
                              <input
                                type="number"
                                inputMode="numeric"
                                value={rule.seasonNumber}
                                onChange={(event) =>
                                  updatePatternRule(
                                    rule.id,
                                    'seasonNumber',
                                    event.target.value,
                                  )
                                }
                                placeholder="S fixed"
                                min={-1}
                              />
                              <input
                                type="number"
                                inputMode="numeric"
                                value={rule.episodeNumber}
                                onChange={(event) =>
                                  updatePatternRule(
                                    rule.id,
                                    'episodeNumber',
                                    event.target.value,
                                  )
                                }
                                placeholder="E fixed"
                                min={0}
                              />
                              <label className="metadata-detect-pattern-toggle">
                                <input
                                  type="checkbox"
                                  checked={rule.caseSensitive}
                                  onChange={(event) =>
                                    updatePatternRuleCaseSensitivity(
                                      rule.id,
                                      event.target.checked,
                                    )
                                  }
                                />
                                Case sensitive
                              </label>
                              <button
                                type="button"
                                className="metadata-detect-remove"
                                onClick={() => removePatternRule(rule.id)}
                                disabled={saving}
                                aria-label="Remove pattern rule"
                              >
                                Remove
                              </button>
                            </div>
                            <p className="metadata-detect-pattern-preview">
                              Generated pattern: {formatPatternRulePreview(rule)}
                            </p>
                            {rule.legacyPattern ? (
                              <p className="metadata-detect-pattern-legacy">
                                Legacy regex preserved until landmarks are set.
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </div>

                {detectRuleSet.errors.length > 0 ? (
                  <p className="metadata-detect-errors">
                    {detectRuleSet.errors.join(' ')}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="metadata-preview">
            <p className="metadata-preview-label">
              Assignment Preview
              {isDetectMode ? (
                <span className="metadata-preview-hint">
                  {' '}
                  · {detectionCount} detected / {rows.length - detectionCount} sequential / {customRuleCount} custom-rule matches / {sampleCount} sample clips
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
                          overrides[row.item.id]
                            ? 'Manually edited'
                            : detectionTitle(row)
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
                          onChange={(e) => handleRowOverride(row.item.id, 'season', e.target.value)}
                          min={-1}
                          aria-label={`Season for ${row.item.relativePath}`}
                        />
                        <span className="metadata-row-prefix">E</span>
                        <input
                          type="number"
                          className={`metadata-row-input${overrides[row.item.id] ? ' is-overridden' : ''}`}
                          value={overrides[row.item.id]?.episode ?? String(row.episodeNumber)}
                          onChange={(e) => handleRowOverride(row.item.id, 'episode', e.target.value)}
                          min={0}
                          aria-label={`Episode for ${row.item.relativePath}`}
                        />
                      </span>
                      <span className="metadata-preview-path" title={row.item.relativePath}>
                        {renderHighlightedPath(row, detectRuleSet.rules)}
                      </span>
                      <span className="metadata-preview-actions">
                        {isDeletePending ? (
                          <>
                            <button
                              type="button"
                              className="metadata-preview-delete is-confirm"
                              disabled={busy}
                              onClick={() => {
                                void confirmDeletePreviewItem(row);
                              }}
                            >
                              {isDeletingThisRow ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              className="metadata-preview-delete-cancel"
                              disabled={busy}
                              onClick={() => cancelDeletePreviewItem(row.item.id)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="metadata-preview-delete"
                            disabled={busy}
                            onClick={() => beginDeletePreviewItem(row.item.id)}
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

          {saving ? (
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
          ) : null}

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
