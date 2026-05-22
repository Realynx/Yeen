import { normalizeTitleKey } from './mediaDetailsUtils';

export type TorrentBadgeKind =
  | 'group'
  | 'resolution'
  | 'source'
  | 'video'
  | 'audio'
  | 'language'
  | 'format'
  | 'release'
  | 'misc';

export interface TorrentNameBadge {
  label: string;
  kind: TorrentBadgeKind;
}

export type TorrentReleaseKind =
  | 'episode'
  | 'range'
  | 'pack'
  | 'movie'
  | 'special'
  | 'unknown';

export interface TorrentReleaseMarker {
  kind: TorrentReleaseKind;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  label: string | null;
}

export interface NormalizedTorrentTitle {
  rawTitle: string;
  baseTitle: string;
  displayTitle: string;
  badges: TorrentNameBadge[];
  unknownTags: string[];
  release: TorrentReleaseMarker;
  aggregationKey: string;
  episodeSortKey: number | null;
}

const RESOLUTION_PATTERN =
  /\b(?:4320p|2160p|1440p|1080p|900p|720p|576p|540p|480p|360p|4k|8k)\b/gi;
const SOURCE_PATTERN =
  /\b(?:bdrip|bluray|blu-ray|bdmv|web[ .-]?(?:dl|rip)?|hdtv|dvd(?:rip)?|remux|tvrip)\b/gi;
const VIDEO_PATTERN =
  /\b(?:hevc|av1|avc|x264|x265|h\.?264|h\.?265|vp9|hi10|10bit|8bit)\b/gi;
const AUDIO_PATTERN =
  /\b(?:dual[ -]?audio|multi[ -]?subs?|flac|aac\s*\d(?:\.\d)?|aac|opus|ddp?(?:\s*[\d.]+)?|dts(?:-hd(?:\s*ma)?)?|truehd|eac3|ac3)\b/gi;
const LANGUAGE_PATTERN =
  /\b(?:vostfr|eng(?:lish)?(?:\s*dub)?|dub(?:bed)?|sub(?:bed)?|jpn|jp|rus|ita|esp|ger|chs|cht|mandarin)\b/gi;
const FORMAT_PATTERN = /\b(?:mkv|mp4|avi|bdmv)\b/gi;
const RELEASE_PATTERN =
  /\b(?:repack|proper|uncensored|batch|complete|specials?|ova|ona|movie|theat(?:er|re)(?:\s*manners?)?|remaster|season\s*\d+)\b/gi;

const RELEASE_PACK_PATTERN =
  /\b(?:batch|complete|全集|collection|set|season\s*\d+\s*\+|s\d+\s*\+|vol(?:ume)?\.?\s*\d+\s*-\s*\d+)\b/i;
const MOVIE_PATTERN = /\b(?:movie|the\s+movie|film|gekijouban)\b/i;
const SPECIAL_PATTERN = /\b(?:ova|ona|special|sp(?:ecial)?)\b/i;

const EPISODE_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*E(\d{1,3})(?:\s*[-~]\s*E?(\d{1,3}))?\b/i,
  /\b(\d{1,2})x(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\b/i,
];

const EPISODE_ONLY_PATTERN = /\bE(?:P)?\.?\s*(\d{1,3})\b/i;
const RANGE_PATTERN = /(?:^|[\s\[(])(\d{1,3})\s*[-~]\s*(\d{1,3})(?=$|[\s\])])/i;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function padEpisode(value: number): string {
  if (value >= 100) {
    return String(value);
  }

  return String(value).padStart(2, '0');
}

function cleanBadgeLabel(value: string): string {
  return normalizeWhitespace(value)
    .replace(/^[-_/.,\s]+/, '')
    .replace(/[-_/.,\s]+$/, '');
}

function canonicalSource(raw: string): string {
  const normalized = raw.toUpperCase().replace(/[\s.-]/g, '');

  if (normalized.startsWith('WEBDL')) {
    return 'WEB-DL';
  }

  if (normalized.startsWith('WEBRIP')) {
    return 'WEBRip';
  }

  if (normalized === 'WEB') {
    return 'WEB';
  }

  if (
    normalized.startsWith('BLURAY')
    || normalized.startsWith('BDRIP')
    || normalized === 'BD'
    || normalized === 'BDMV'
  ) {
    return 'BluRay';
  }

  if (normalized.startsWith('DVD')) {
    return 'DVD';
  }

  if (normalized.startsWith('HDTV')) {
    return 'HDTV';
  }

  if (normalized.startsWith('REMUX')) {
    return 'REMUX';
  }

  if (normalized.startsWith('TVRIP')) {
    return 'TVRip';
  }

  return raw.toUpperCase();
}

function canonicalVideo(raw: string): string {
  const normalized = raw.toUpperCase().replace(/[\s.-]/g, '');

  if (normalized === 'H264' || normalized === 'X264') {
    return 'x264';
  }

  if (normalized === 'H265' || normalized === 'X265') {
    return 'x265';
  }

  if (normalized === 'HEVC') {
    return 'HEVC';
  }

  if (normalized === 'AVC') {
    return 'AVC';
  }

  if (normalized === 'AV1') {
    return 'AV1';
  }

  if (normalized === 'VP9') {
    return 'VP9';
  }

  if (normalized === 'HI10' || normalized === '10BIT') {
    return '10-bit';
  }

  if (normalized === '8BIT') {
    return '8-bit';
  }

  return raw.toUpperCase();
}

function canonicalAudio(raw: string): string {
  const normalized = raw.toUpperCase().replace(/[\s_-]/g, '');

  if (normalized.startsWith('DUALAUDIO')) {
    return 'Dual Audio';
  }

  if (normalized.startsWith('MULTISUB')) {
    return 'Multi-Subs';
  }

  if (normalized.startsWith('AAC')) {
    const suffix = normalized.slice(3);
    return suffix ? `AAC ${suffix}` : 'AAC';
  }

  if (normalized.startsWith('DDP')) {
    const suffix = normalized.slice(3);
    return suffix ? `DDP ${suffix}` : 'DDP';
  }

  if (normalized.startsWith('DD')) {
    const suffix = normalized.slice(2);
    return suffix ? `DD ${suffix}` : 'DD';
  }

  if (normalized.startsWith('DTSHDMA')) {
    return 'DTS-HD MA';
  }

  if (normalized.startsWith('DTSHD')) {
    return 'DTS-HD';
  }

  if (normalized.startsWith('DTS')) {
    return 'DTS';
  }

  if (normalized === 'FLAC') {
    return 'FLAC';
  }

  if (normalized === 'OPUS') {
    return 'Opus';
  }

  if (normalized === 'TRUEHD') {
    return 'TrueHD';
  }

  if (normalized === 'EAC3') {
    return 'EAC3';
  }

  if (normalized === 'AC3') {
    return 'AC3';
  }

  return raw.toUpperCase();
}

function canonicalLanguage(raw: string): string {
  const normalized = raw.toUpperCase().replace(/\s+/g, '');

  if (normalized === 'ENGLISHDUB') {
    return 'English Dub';
  }

  if (normalized === 'DUB' || normalized === 'DUBBED') {
    return 'Dubbed';
  }

  if (normalized === 'SUB' || normalized === 'SUBBED') {
    return 'Subbed';
  }

  if (normalized === 'JPN' || normalized === 'JP') {
    return 'JP';
  }

  if (normalized === 'ENG' || normalized === 'ENGLISH') {
    return 'EN';
  }

  if (normalized === 'RUS') {
    return 'RU';
  }

  if (normalized === 'ITA') {
    return 'IT';
  }

  if (normalized === 'ESP') {
    return 'ES';
  }

  if (normalized === 'GER') {
    return 'DE';
  }

  if (normalized === 'CHS') {
    return 'CHS';
  }

  if (normalized === 'CHT') {
    return 'CHT';
  }

  if (normalized === 'MANDARIN') {
    return 'Mandarin';
  }

  if (normalized === 'VOSTFR') {
    return 'VOSTFR';
  }

  return raw.toUpperCase();
}

function canonicalRelease(raw: string): string {
  const normalized = raw.toUpperCase().replace(/\s+/g, ' ');

  if (normalized.includes('SEASON')) {
    const match = normalized.match(/SEASON\s*(\d{1,2})/i);
    if (match?.[1]) {
      return `Season ${match[1]}`;
    }
  }

  if (normalized.includes('SPECIAL')) {
    return 'Special';
  }

  if (normalized.includes('BATCH')) {
    return 'Batch';
  }

  if (normalized.includes('COMPLETE')) {
    return 'Complete';
  }

  if (normalized.includes('OVA')) {
    return 'OVA';
  }

  if (normalized.includes('ONA')) {
    return 'ONA';
  }

  if (normalized.includes('REPACK')) {
    return 'REPACK';
  }

  if (normalized.includes('PROPER')) {
    return 'PROPER';
  }

  if (normalized.includes('UNCENSORED')) {
    return 'Uncensored';
  }

  if (normalized.includes('MOVIE')) {
    return 'Movie';
  }

  if (normalized.includes('THEATER') || normalized.includes('THEATRE')) {
    return 'Theater';
  }

  if (normalized.includes('REMASTER')) {
    return 'Remaster';
  }

  return cleanBadgeLabel(raw);
}

function collectMatches(input: string, regex: RegExp): string[] {
  const matches: string[] = [];
  const pattern = new RegExp(regex.source, regex.flags);

  for (const match of input.matchAll(pattern)) {
    if (match[0]) {
      matches.push(match[0]);
    }
  }

  return matches;
}

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

function detectReleaseMarker(rawTitle: string): TorrentReleaseMarker {
  const normalizedTitle = normalizeWhitespace(rawTitle);

  for (const pattern of EPISODE_PATTERNS) {
    const match = normalizedTitle.match(pattern);
    if (!match) {
      continue;
    }

    const season = parsePositiveInt(match[1]);
    const episodeStart = parsePositiveInt(match[2]);
    const episodeEnd = parsePositiveInt(match[3]);

    if (!season || !episodeStart) {
      continue;
    }

    if (episodeEnd && episodeEnd >= episodeStart) {
      return {
        kind: 'range',
        season,
        episode: episodeStart,
        episodeEnd,
        label: `S${String(season).padStart(2, '0')}E${padEpisode(episodeStart)}-E${padEpisode(episodeEnd)}`,
      };
    }

    return {
      kind: 'episode',
      season,
      episode: episodeStart,
      episodeEnd: null,
      label: `S${String(season).padStart(2, '0')}E${padEpisode(episodeStart)}`,
    };
  }

  const explicitEpisodeMatch = normalizedTitle.match(EPISODE_ONLY_PATTERN);
  if (explicitEpisodeMatch) {
    const episode = parsePositiveInt(explicitEpisodeMatch[1]);
    if (episode) {
      const seasonMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
      const season = parsePositiveInt(seasonMatch?.[1]);
      return {
        kind: 'episode',
        season,
        episode,
        episodeEnd: null,
        label: season
          ? `S${String(season).padStart(2, '0')}E${padEpisode(episode)}`
          : `Episode ${padEpisode(episode)}`,
      };
    }
  }

  const rangeMatch = normalizedTitle.match(RANGE_PATTERN);
  if (rangeMatch) {
    const start = parsePositiveInt(rangeMatch[1]);
    const end = parsePositiveInt(rangeMatch[2]);
    const looksLikeYearRange =
      typeof start === 'number'
      && typeof end === 'number'
      && start >= 1900
      && end >= 1900;
    const seasonMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
    const season = parsePositiveInt(seasonMatch?.[1]);

    if (
      !looksLikeYearRange
      && start
      && end
      && end >= start
      && start <= 200
      && end <= 200
    ) {
      const isPack = RELEASE_PACK_PATTERN.test(normalizedTitle);
      const label = season
        ? `S${String(season).padStart(2, '0')}E${padEpisode(start)}-E${padEpisode(end)}`
        : `E${padEpisode(start)}-E${padEpisode(end)}`;

      return {
        kind: isPack ? 'pack' : 'range',
        season,
        episode: start,
        episodeEnd: end,
        label,
      };
    }
  }

  const seasonOnlyMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
  const detectedSeason = parsePositiveInt(seasonOnlyMatch?.[1]);
  const hasPack = RELEASE_PACK_PATTERN.test(normalizedTitle);
  if (hasPack) {
    return {
      kind: 'pack',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: detectedSeason ? `Season ${detectedSeason} Pack` : 'Pack',
    };
  }

  if (MOVIE_PATTERN.test(normalizedTitle)) {
    return {
      kind: 'movie',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: 'Movie',
    };
  }

  if (SPECIAL_PATTERN.test(normalizedTitle)) {
    return {
      kind: 'special',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: detectedSeason ? `Season ${detectedSeason} Special` : 'Special',
    };
  }

  return {
    kind: 'unknown',
    season: detectedSeason,
    episode: null,
    episodeEnd: null,
    label: null,
  };
}

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

function collectUnknownTags(rawTitle: string, queryTitle: string): string[] {
  const unknownTags = new Map<string, string>();
  const queryKey = normalizeTitleKey(queryTitle);

  const bracketPattern = /[\[\(\{]([^\]\)\}]{2,80})[\]\)\}]/g;
  for (const match of rawTitle.matchAll(bracketPattern)) {
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

function deriveBaseTitle(rawTitle: string, queryTitle: string): string {
  const query = normalizeWhitespace(queryTitle);
  const queryKey = normalizeTitleKey(query);

  let cleaned = normalizeWhitespace(rawTitle)
    .replace(/^(\[[^\]]+\]\s*)+/g, ' ')
    .replace(/[\[\(\{][^\]\)\}]{1,80}[\]\)\}]/g, ' ')
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

function buildDisplayTitle(
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

function extractLeadingGroups(rawTitle: string): { groups: string[]; remainder: string } {
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

function buildAggregationKey(
  baseTitle: string,
  release: TorrentReleaseMarker,
  badges: TorrentNameBadge[],
): string {
  const baseKey = normalizeTitleKey(baseTitle);
  if (!baseKey) {
    return '';
  }

  const stableBadgeKey = badges
    .filter((badge) => (
      badge.kind === 'group'
      || badge.kind === 'resolution'
      || badge.kind === 'source'
      || badge.kind === 'video'
      || badge.kind === 'audio'
      || badge.kind === 'language'
      || badge.kind === 'format'
    ))
    .map((badge) => normalizeTitleKey(badge.label))
    .sort()
    .join('|');

  const seasonKey = release.season ? `s${release.season}` : 's0';
  return `${baseKey}::${seasonKey}::${stableBadgeKey}`;
}

function buildEpisodeSortKey(release: TorrentReleaseMarker): number | null {
  if (release.episode === null) {
    return null;
  }

  const seasonWeight = (release.season ?? 0) * 1_000;
  return seasonWeight + release.episode;
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
