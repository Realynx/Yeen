import { normalizeTitleKey } from '../mediaDetailsUtils';
import {
  AUDIO_PATTERN,
  FORMAT_PATTERN,
  LANGUAGE_PATTERN,
  RELEASE_PATTERN,
  RESOLUTION_PATTERN,
  SOURCE_PATTERN,
  VIDEO_PATTERN,
} from './patterns';
import {
  canonicalAudio,
  canonicalLanguage,
  canonicalRelease,
  canonicalSource,
  canonicalVideo,
  cleanBadgeLabel,
  collectMatches,
  normalizeWhitespace,
} from './helpers';
import { detectReleaseMarker } from './release';
import {
  buildAggregationKey,
  buildDisplayTitle,
  buildEpisodeSortKey,
  collectUnknownTags,
  deriveBaseTitle,
  extractLeadingGroups,
} from './title';
import type {
  NormalizedTorrentTitle,
  TorrentBadgeKind,
  TorrentNameBadge,
} from './types';

function addBadge(
  badges: Map<string, TorrentNameBadge>,
  kind: TorrentBadgeKind,
  rawLabel: string,
) {
  const label = cleanBadgeLabel(rawLabel);
  if (!label) {
    return;
  }

  const key = `${kind}:${normalizeTitleKey(label)}`;
  if (badges.has(key)) {
    return;
  }

  badges.set(key, {
    kind,
    label,
  });
}

export function normalizeTorrentResultTitle(
  rawTitle: string,
  queryTitle: string,
): NormalizedTorrentTitle {
  const cleanedRawTitle = normalizeWhitespace(rawTitle);
  const release = detectReleaseMarker(cleanedRawTitle);
  const unknownTags = collectUnknownTags(cleanedRawTitle, queryTitle);
  const { groups, remainder } = extractLeadingGroups(cleanedRawTitle);
  const baseTitle = deriveBaseTitle(remainder || cleanedRawTitle, queryTitle);
  const badges = new Map<string, TorrentNameBadge>();

  for (const group of groups.slice(0, 2)) {
    addBadge(badges, 'group', group);
  }

  for (const resolution of collectMatches(cleanedRawTitle, RESOLUTION_PATTERN)) {
    addBadge(badges, 'resolution', resolution.toUpperCase());
  }

  for (const source of collectMatches(cleanedRawTitle, SOURCE_PATTERN)) {
    addBadge(badges, 'source', canonicalSource(source));
  }

  for (const video of collectMatches(cleanedRawTitle, VIDEO_PATTERN)) {
    addBadge(badges, 'video', canonicalVideo(video));
  }

  for (const audio of collectMatches(cleanedRawTitle, AUDIO_PATTERN)) {
    addBadge(badges, 'audio', canonicalAudio(audio));
  }

  for (const language of collectMatches(cleanedRawTitle, LANGUAGE_PATTERN)) {
    addBadge(badges, 'language', canonicalLanguage(language));
  }

  for (const format of collectMatches(cleanedRawTitle, FORMAT_PATTERN)) {
    addBadge(badges, 'format', format.toUpperCase());
  }

  for (const releaseTag of collectMatches(cleanedRawTitle, RELEASE_PATTERN)) {
    addBadge(badges, 'release', canonicalRelease(releaseTag));
  }

  if (release.kind === 'pack') {
    addBadge(badges, 'release', 'Pack');
  }

  if (release.kind === 'movie') {
    addBadge(badges, 'release', 'Movie');
  }

  if (release.kind === 'special') {
    addBadge(badges, 'release', 'Special');
  }

  const displayTitle = buildDisplayTitle(baseTitle, release, unknownTags);
  const badgeList = Array.from(badges.values());

  return {
    rawTitle: cleanedRawTitle,
    baseTitle,
    displayTitle,
    badges: badgeList,
    unknownTags,
    release,
    aggregationKey: buildAggregationKey(baseTitle, release, badgeList),
    episodeSortKey: buildEpisodeSortKey(release),
  };
}
