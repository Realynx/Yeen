function normalizeInternalWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function normalizeWhitespace(input: string): string {
  return normalizeInternalWhitespace(input);
}

export function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function padEpisode(value: number): string {
  if (value >= 100) {
    return String(value);
  }

  return String(value).padStart(2, '0');
}

export function cleanBadgeLabel(value: string): string {
  return normalizeInternalWhitespace(value)
    .replace(/^[-_/.,\s]+/, '')
    .replace(/[-_/.,\s]+$/, '');
}

export function canonicalSource(raw: string): string {
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

export function canonicalVideo(raw: string): string {
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

export function canonicalAudio(raw: string): string {
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

export function canonicalLanguage(raw: string): string {
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

export function canonicalRelease(raw: string): string {
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

export function collectMatches(input: string, regex: RegExp): string[] {
  const matches: string[] = [];
  const pattern = new RegExp(regex.source, regex.flags);

  for (const match of input.matchAll(pattern)) {
    if (match[0]) {
      matches.push(match[0]);
    }
  }

  return matches;
}
