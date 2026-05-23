import type { ReactNode } from 'react';
import {
  detectSeasonEpisodeFromPath,
  type FilenameParseRules,
} from '../../services/filenameParse';
import type { MediaItem } from '../../../shared/services/types';
import type { AssignmentRow, EpisodeOrder } from './types';

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

  return [...items].sort((left, right) =>
    naturalCompare(left.relativePath, right.relativePath),
  );
}

export function buildAssignmentRows(
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

export function rowsShareSeason(rows: AssignmentRow[]): boolean {
  if (rows.length === 0) return true;
  const first = rows[0].seasonNumber;
  return rows.every((row) => row.seasonNumber === first);
}

export function detectionBadgeLabel(row: AssignmentRow): string {
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

export function detectionTitle(row: AssignmentRow): string {
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
  const flags = (mapping?.flags ?? '').replace(/[^imsu]/g, '');

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
  const candidates = [
    relativePath,
    relativePath.split(/[/\\]/).pop() ?? relativePath,
  ];
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

export function renderHighlightedPath(
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
      <span className="metadata-preview-path-highlight">
        {relativePath.slice(start, end)}
      </span>
      {relativePath.slice(end)}
    </>
  );
}
