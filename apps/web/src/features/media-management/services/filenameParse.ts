/**
 * Lightweight client-side mirror of the server-side `parseSeasonEpisode`
 * helper used by the admin "Assign to Series" UI to suggest per-file
 * season/episode numbers based on the source filename + path. Kept
 * intentionally simple: detects the strongest signals only (S##E##,
 * Season folder + episode digits, anime-style "- 01"). Falls back to
 * `null` so the dialog can sequentially number unmatched items.
 */

export interface ParsedSeasonEpisode {
  seasonNumber: number | null;
  episodeNumber: number | null;
  isAbsoluteEpisode: boolean;
}

export type FilenameDetectionSource = 'builtin' | 'pattern' | 'keyword' | 'none';

export interface FilenameKeywordMappingRule {
  keyword: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface FilenamePatternMappingRule {
  pattern: string;
  flags?: string;
  seasonGroup?: number | null;
  episodeGroup?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface FilenameParseRules {
  keywordMappings?: readonly FilenameKeywordMappingRule[];
  patternMappings?: readonly FilenamePatternMappingRule[];
}

export interface ParsedSeasonEpisodeWithSource extends ParsedSeasonEpisode {
  source: FilenameDetectionSource;
  matchedPattern: string | null;
  matchedKeyword: string | null;
}

const EMPTY: ParsedSeasonEpisode = {
  seasonNumber: null,
  episodeNumber: null,
  isAbsoluteEpisode: false,
};

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeasonFromPath(relativePath: string): number | null {
  if (!relativePath) return null;
  const segments = relativePath.split(/[/\\]/).slice(0, -1);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];

    // "Specials" / "Special" → season 0
    if (/^specials?$/i.test(seg)) return 0;

    const m =
      seg.match(/^(?:season|saison|series|series\s*-)\s*(\d{1,2})$/i) ??
      seg.match(/^s(\d{1,2})$/i);
    if (m) {
      const value = toInt(m[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '');
}

export function parseSeasonEpisodeFromPath(
  relativePath: string,
): ParsedSeasonEpisode {
  return parseSeasonEpisodeBuiltin(relativePath);
}

export function detectSeasonEpisodeFromPath(
  relativePath: string,
  rules?: FilenameParseRules,
): ParsedSeasonEpisodeWithSource {
  const builtin = parseSeasonEpisodeBuiltin(relativePath);
  let seasonNumber = builtin.seasonNumber;
  let episodeNumber = builtin.episodeNumber;
  let source: FilenameDetectionSource =
    builtin.seasonNumber !== null || builtin.episodeNumber !== null
      ? 'builtin'
      : 'none';
  let matchedPattern: string | null = null;
  let matchedKeyword: string | null = null;

  const fileName = stripExtension(
    relativePath.split(/[/\\]/).pop() ?? relativePath,
  );

  const patternMatch = applyPatternMappings(relativePath, fileName, rules);
  if (patternMatch) {
    if (patternMatch.seasonNumber !== null) {
      seasonNumber = patternMatch.seasonNumber;
    }
    if (patternMatch.episodeNumber !== null) {
      episodeNumber = patternMatch.episodeNumber;
    }
    source = 'pattern';
    matchedPattern = patternMatch.pattern;
  }

  const keywordMatch = applyKeywordMappings(relativePath, rules);
  if (keywordMatch) {
    if (keywordMatch.seasonNumber !== null) {
      seasonNumber = keywordMatch.seasonNumber;
    }
    if (keywordMatch.episodeNumber !== null) {
      episodeNumber = keywordMatch.episodeNumber;
    }
    source = 'keyword';
    matchedKeyword = keywordMatch.keyword;
  }

  return {
    seasonNumber,
    episodeNumber,
    isAbsoluteEpisode: seasonNumber === null && episodeNumber !== null,
    source,
    matchedPattern,
    matchedKeyword,
  };
}

function parseSeasonEpisodeBuiltin(relativePath: string): ParsedSeasonEpisode {
  if (!relativePath) return EMPTY;

  const fileName = stripExtension(
    relativePath.split(/[/\\]/).pop() ?? relativePath,
  );

  const seasonFromPath = parseSeasonFromPath(relativePath);
  return parsePairedSeasonEpisode(fileName)
    ?? parseEpisodeOnly(fileName, seasonFromPath)
    ?? parseAnimeEpisode(fileName, seasonFromPath)
    ?? parseSeasonFolderEpisode(fileName, seasonFromPath)
    ?? EMPTY;
}

function parsedPair(match: RegExpMatchArray | null): ParsedSeasonEpisode | null {
  return match ? { seasonNumber: toInt(match[1]), episodeNumber: toInt(match[2]), isAbsoluteEpisode: false } : null;
}

function parsePairedSeasonEpisode(fileName: string): ParsedSeasonEpisode | null {
  return parsedPair(fileName.match(/s(\d{1,2})[\s._-]?e(\d{1,3})/i))
    ?? parsedPair(fileName.match(/\b(\d{1,2})x(\d{1,3})\b/i))
    ?? parsedPair(fileName.match(/season[\s._-]*(\d{1,2})[\s._-]+episode[\s._-]*(\d{1,3})/i));
}

function episodeResult(value: number | null, seasonNumber: number | null): ParsedSeasonEpisode | null {
  return value !== null
    ? { seasonNumber, episodeNumber: value, isAbsoluteEpisode: seasonNumber === null }
    : null;
}

function parseEpisodeOnly(fileName: string, seasonNumber: number | null): ParsedSeasonEpisode | null {
  const match = fileName.match(/(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,3})\b/i);
  return episodeResult(toInt(match?.[1]), seasonNumber);
}

function parseAnimeEpisode(fileName: string, seasonNumber: number | null): ParsedSeasonEpisode | null {
  const match = fileName.match(/[\s._]-[\s._](\d{1,4})(?:v\d+)?(?:[\s._-]|$)/);
  const value = toInt(match?.[1]);
  return value !== null && value > 0 && value < 2000 ? episodeResult(value, seasonNumber) : null;
}

function parseSeasonFolderEpisode(fileName: string, seasonNumber: number | null): ParsedSeasonEpisode | null {
  if (seasonNumber === null) return null;
  const leadingValue = toInt(fileName.match(/^(\d{1,3})(?:[\s._-]|$)/)?.[1]);
  if (leadingValue !== null && leadingValue > 0) return episodeResult(leadingValue, seasonNumber);
  const compactValue = toInt(fileName.match(/(?:^|[\s._-])(\d{3,4})(?:[\s._-]|$)/)?.[1]);
  if (compactValue !== null && compactValue >= 100 && compactValue < 5000) {
    const compactSeason = Math.floor(compactValue / 100);
    const episode = compactValue % 100;
    if (episode > 0 && compactSeason === seasonNumber) return episodeResult(episode, compactSeason);
  }
  return { seasonNumber, episodeNumber: null, isAbsoluteEpisode: false };
}

function applyPatternMappings(
  relativePath: string,
  fileName: string,
  rules: FilenameParseRules | undefined,
): { pattern: string; seasonNumber: number | null; episodeNumber: number | null } | null {
  if (!rules?.patternMappings || rules.patternMappings.length === 0) {
    return null;
  }

  const candidates = [relativePath, fileName];

  for (const mapping of rules.patternMappings) {
    const pattern = mapping.pattern?.trim() ?? '';
    if (!pattern) {
      continue;
    }

    const result = matchPatternMapping(mapping, pattern, candidates);
    if (result) return result;
  }

  return null;
}

function matchPatternMapping(
  mapping: FilenamePatternMappingRule,
  pattern: string,
  candidates: string[],
): { pattern: string; seasonNumber: number | null; episodeNumber: number | null } | null {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, sanitizePatternFlags(mapping.flags));
  } catch {
    return null;
  }
  const seasonGroup = normalizeOptionalPositiveInt(mapping.seasonGroup);
  const episodeGroup = normalizeOptionalPositiveInt(mapping.episodeGroup);
  for (const candidate of candidates) {
    const match = regex.exec(candidate);
    if (!match) continue;
    const seasonNumber = normalizeOptionalSeasonInt(mapping.seasonNumber)
      ?? (seasonGroup ? toInt(match[seasonGroup]) : null);
    const episodeNumber = normalizeOptionalNonNegativeInt(mapping.episodeNumber)
      ?? (episodeGroup ? toInt(match[episodeGroup]) : null);
    if (seasonNumber !== null || episodeNumber !== null) return { pattern, seasonNumber, episodeNumber };
  }
  return null;
}

function applyKeywordMappings(
  relativePath: string,
  rules: FilenameParseRules | undefined,
): { keyword: string; seasonNumber: number | null; episodeNumber: number | null } | null {
  if (!rules?.keywordMappings || rules.keywordMappings.length === 0) {
    return null;
  }

  const loweredPath = relativePath.toLowerCase();

  for (const mapping of rules.keywordMappings) {
    const keyword = mapping.keyword?.trim().toLowerCase() ?? '';
    if (!keyword) {
      continue;
    }

    if (!loweredPath.includes(keyword)) {
      continue;
    }

    const seasonNumber = normalizeOptionalSeasonInt(mapping.seasonNumber);
    const episodeNumber = normalizeOptionalNonNegativeInt(mapping.episodeNumber);

    if (seasonNumber === null && episodeNumber === null) {
      continue;
    }

    return {
      keyword,
      seasonNumber,
      episodeNumber,
    };
  }

  return null;
}

function normalizeOptionalNonNegativeInt(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeOptionalSeasonInt(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -1) {
    return null;
  }

  return Math.floor(value);
}

function normalizeOptionalPositiveInt(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return null;
  }

  return Math.floor(value);
}

function sanitizePatternFlags(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const allowed = new Set(['i', 'm', 's', 'u']);
  const deduped = new Set<string>();

  for (const char of value.toLowerCase()) {
    if (allowed.has(char)) {
      deduped.add(char);
    }
  }

  return [...deduped].join('');
}
