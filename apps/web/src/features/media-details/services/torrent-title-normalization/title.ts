import { normalizeTitleKey } from '../mediaDetailsUtils';
import {
  AUDIO_PATTERN,
  BRACKETED_SEGMENT_PATTERN,
  FORMAT_PATTERN,
  LANGUAGE_PATTERN,
  RELEASE_PATTERN,
  RESOLUTION_PATTERN,
  SOURCE_PATTERN,
  VIDEO_PATTERN,
} from './patterns';
import {
  collectMatches,
  normalizeWhitespace,
} from './helpers';
import { detectReleaseMarker } from './release';
import type {
  TorrentNameBadge,
  TorrentReleaseMarker,
} from './types';

function tokenOverlapRatio(left: string, right: string): number {
  const leftTokens = new Set(
    left
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );

  const rightTokens = new Set(
    right
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function isLikelyKnownSegment(input: string): boolean {
  const segment = normalizeWhitespace(input);
  if (!segment) {
    return false;
  }

  if (/^[a-f0-9]{8,}$/i.test(segment)) {
    return true;
  }

  if (collectMatches(segment, RESOLUTION_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, SOURCE_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, VIDEO_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, AUDIO_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, LANGUAGE_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, FORMAT_PATTERN).length > 0) {
    return true;
  }

  if (collectMatches(segment, RELEASE_PATTERN).length > 0) {
    return true;
  }

  return detectReleaseMarker(segment).kind !== 'unknown';
}

export function collectUnknownTags(rawTitle: string, queryTitle: string): string[] {
  const unknownTags = new Map<string, string>();
  const queryKey = normalizeTitleKey(queryTitle);

  for (const match of rawTitle.matchAll(BRACKETED_SEGMENT_PATTERN)) {
    const candidate = normalizeWhitespace(match[1] ?? '');
    if (!candidate || isLikelyKnownSegment(candidate)) {
      continue;
    }

    const normalized = normalizeTitleKey(candidate);
    if (!normalized || normalized.length < 3 || normalized === queryKey) {
      continue;
    }

    if (candidate.length > 40) {
      continue;
    }

    unknownTags.set(normalized, candidate);
  }

  const pipeSections = rawTitle.split('|').slice(1);
  for (const section of pipeSections) {
    const candidate = normalizeWhitespace(section);
    if (!candidate || isLikelyKnownSegment(candidate)) {
      continue;
    }

    const normalized = normalizeTitleKey(candidate);
    if (!normalized || normalized.length < 3 || normalized === queryKey) {
      continue;
    }

    if (candidate.length > 40) {
      continue;
    }

    unknownTags.set(normalized, candidate);
  }

  return Array.from(unknownTags.values()).slice(0, 2);
}

function removeKnownMarkers(input: string): string {
  return input
    .replace(RESOLUTION_PATTERN, ' ')
    .replace(SOURCE_PATTERN, ' ')
    .replace(VIDEO_PATTERN, ' ')
    .replace(AUDIO_PATTERN, ' ')
    .replace(LANGUAGE_PATTERN, ' ')
    .replace(FORMAT_PATTERN, ' ')
    .replace(RELEASE_PATTERN, ' ')
    .replace(/\b\d{3,4}x\d{3,4}\b/gi, ' ')
    .replace(/\bS\d{1,2}\s*E\d{1,3}(?:\s*[-~]\s*E?\d{1,3})?\b/gi, ' ')
    .replace(/\b\d{1,2}x\d{1,3}(?:\s*[-~]\s*\d{1,3})?\b/gi, ' ')
    .replace(/\bE(?:P)?\.?\s*\d{1,3}\b/gi, ' ')
    .replace(/\bV\d+\b/gi, ' ')
    .replace(/\b[A-F0-9]{8}\b/gi, ' ');
}

export function deriveBaseTitle(rawTitle: string, queryTitle: string): string {
  const query = normalizeWhitespace(queryTitle);
  const queryKey = normalizeTitleKey(query);

  let cleaned = normalizeWhitespace(rawTitle)
    .replace(/^(\[[^\]]+\]\s*)+/g, ' ')
    .replace(/(?:\[|\(|\{)[^)\]}]{1,80}(?:\]|\)|\})/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[._]/g, ' ')
    .replace(/\s+-\s+/g, ' ');

  cleaned = removeKnownMarkers(cleaned);
  cleaned = normalizeWhitespace(cleaned);

  if (!cleaned) {
    return query || normalizeWhitespace(rawTitle);
  }

  if (!queryKey) {
    return cleaned;
  }

  const cleanedKey = normalizeTitleKey(cleaned);

  if (!cleanedKey) {
    return query;
  }

  if (cleanedKey.includes(queryKey) || queryKey.includes(cleanedKey)) {
    return query;
  }

  if (tokenOverlapRatio(cleanedKey, queryKey) >= 0.55) {
    return query;
  }

  return cleaned;
}

export function buildDisplayTitle(
  baseTitle: string,
  release: TorrentReleaseMarker,
  unknownTags: string[],
): string {
  const suffix: string[] = [];

  if (release.label) {
    suffix.push(release.label);
  }

  for (const tag of unknownTags) {
    const normalizedTag = normalizeTitleKey(tag);
    const alreadyInSuffix = suffix.some(
      (segment) => normalizeTitleKey(segment) === normalizedTag,
    );

    if (!alreadyInSuffix) {
      suffix.push(tag);
    }
  }

  if (suffix.length === 0) {
    return baseTitle;
  }

  return `${baseTitle} · ${suffix.join(' · ')}`;
}

export function extractLeadingGroups(rawTitle: string): {
  groups: string[];
  remainder: string;
} {
  const groups: string[] = [];
  let remainder = normalizeWhitespace(rawTitle);

  while (true) {
    const match = remainder.match(/^\[([^\]]{2,40})\]\s*/);
    if (!match?.[1]) {
      break;
    }

    groups.push(normalizeWhitespace(match[1]));
    remainder = normalizeWhitespace(remainder.slice(match[0].length));
  }

  return {
    groups,
    remainder,
  };
}

export function buildAggregationKey(
  baseTitle: string,
  release: TorrentReleaseMarker,
  badges: TorrentNameBadge[],
): string {
  const baseKey = normalizeTitleKey(baseTitle);
  if (!baseKey) {
    return '';
  }

  const stableBadgeKey = badges
    .filter((badge) =>
      badge.kind === 'group'
      || badge.kind === 'resolution'
      || badge.kind === 'source'
      || badge.kind === 'video'
      || badge.kind === 'audio'
      || badge.kind === 'language'
      || badge.kind === 'format')
    .map((badge) => normalizeTitleKey(badge.label))
    .sort()
    .join('|');

  const seasonKey = release.season ? `s${release.season}` : 's0';
  return `${baseKey}::${seasonKey}::${stableBadgeKey}`;
}

export function buildEpisodeSortKey(release: TorrentReleaseMarker): number | null {
  if (release.episode === null) {
    return null;
  }

  const seasonWeight = (release.season ?? 0) * 1_000;
  return seasonWeight + release.episode;
}
