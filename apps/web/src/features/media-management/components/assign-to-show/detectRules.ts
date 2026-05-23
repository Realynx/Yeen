import type {
  FilenameKeywordMappingRule,
  FilenamePatternMappingRule,
} from '../../services/filenameParse';
import type {
  AssignProgressState,
  DetectRuleBuildResult,
  KeywordRuleDraft,
  PatternRuleDraft,
} from './types';

export function createDraftId(prefix: 'kw' | 'pattern'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function parseOptionalSeasonIntInput(value: string): number | null {
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

export function parseOptionalNonNegativeIntInput(value: string): number | null {
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

export function parseOptionalPositiveIntInput(value: string): number | null {
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

export function sanitizeRuleFlags(rawFlags?: string | null): string {
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

export function buildLandmarkPattern(
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

export function parseGeneratedLandmarkPattern(
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

export function formatPatternRulePreview(rule: PatternRuleDraft): string {
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

export function buildDetectRuleSet(
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

    let pattern: string;
    let flags: string;
    let seasonGroup: number | null;
    let episodeGroup: number | null;
    let descriptor: string;

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

export function createIdleProgressState(): AssignProgressState {
  return {
    mode: 'idle',
    phase: 'preparing',
    total: 0,
    completed: 0,
    currentPath: null,
  };
}
