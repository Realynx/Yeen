import type { SeriesAssignmentRules } from '../../domain/entities/media-item.entity';

function toFiniteInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function parseSeriesKeywordMappings(
  value: unknown,
): NonNullable<SeriesAssignmentRules['keywordMappings']> {
  if (!Array.isArray(value)) {
    return [];
  }

  const rules: NonNullable<SeriesAssignmentRules['keywordMappings']> = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const row = entry as Record<string, unknown>;
    const keyword = typeof row.keyword === 'string' ? row.keyword.trim() : '';
    if (!keyword) {
      continue;
    }

    const seasonNumber = toFiniteInteger(row.seasonNumber);
    const episodeNumber = toFiniteInteger(row.episodeNumber);

    if (seasonNumber === null && episodeNumber === null) {
      continue;
    }

    rules.push({
      keyword,
      seasonNumber,
      episodeNumber,
    });
  }

  return rules;
}

function parseSeriesPatternMappings(
  value: unknown,
): NonNullable<SeriesAssignmentRules['patternMappings']> {
  if (!Array.isArray(value)) {
    return [];
  }

  const rules: NonNullable<SeriesAssignmentRules['patternMappings']> = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const row = entry as Record<string, unknown>;
    const pattern = typeof row.pattern === 'string' ? row.pattern.trim() : '';
    if (!pattern) {
      continue;
    }

    const seasonGroup = toFiniteInteger(row.seasonGroup);
    const episodeGroup = toFiniteInteger(row.episodeGroup);
    const seasonNumber = toFiniteInteger(row.seasonNumber);
    const episodeNumber = toFiniteInteger(row.episodeNumber);

    if (
      seasonGroup === null &&
      episodeGroup === null &&
      seasonNumber === null &&
      episodeNumber === null
    ) {
      continue;
    }

    rules.push({
      pattern,
      flags: typeof row.flags === 'string' ? row.flags : undefined,
      seasonGroup,
      episodeGroup,
      seasonNumber,
      episodeNumber,
    });
  }

  return rules;
}

export function parseSeriesAssignmentRules(
  raw: string | null,
): SeriesAssignmentRules | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const source = parsed as Record<string, unknown>;
    const keywordMappings = parseSeriesKeywordMappings(source.keywordMappings);
    const patternMappings = parseSeriesPatternMappings(source.patternMappings);

    if (keywordMappings.length === 0 && patternMappings.length === 0) {
      return null;
    }

    const rules: SeriesAssignmentRules = {};
    if (keywordMappings.length > 0) {
      rules.keywordMappings = keywordMappings;
    }
    if (patternMappings.length > 0) {
      rules.patternMappings = patternMappings;
    }

    return rules;
  } catch {
    return null;
  }
}
