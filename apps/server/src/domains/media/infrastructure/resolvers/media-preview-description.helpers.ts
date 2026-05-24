export function extractDescriptionFromNfo(
  raw: string,
  nfoDescriptionTags: readonly string[],
): string | null {
  for (const tagName of nfoDescriptionTags) {
    const tagValue = extractNfoTagValue(raw, tagName);
    const normalizedTagValue = normalizeDescriptionText(tagValue);
    if (isUsableDescription(normalizedTagValue)) {
      return normalizedTagValue;
    }
  }

  if (looksLikeXmlDocument(raw)) {
    return null;
  }

  const normalizedFallback = normalizeDescriptionText(raw);
  if (!isUsableDescription(normalizedFallback)) {
    return null;
  }

  return normalizedFallback;
}

function extractNfoTagValue(raw: string, tagName: string): string | null {
  const tagPattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\/${tagName}>`,
    'i',
  );
  const match = raw.match(tagPattern);
  return match?.[1] ?? null;
}

function normalizeDescriptionText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 1400);
}

function isUsableDescription(value: string | null): value is string {
  if (!value) {
    return false;
  }

  return !looksLikeStructuredMetadata(value);
}

function looksLikeXmlDocument(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }

  if (/^<\?xml[\s\S]*\?>/i.test(trimmed)) {
    return true;
  }

  return /<[a-z][^>]*>/i.test(trimmed) && /<\/[a-z][^>]*>/i.test(trimmed);
}

function looksLikeStructuredMetadata(value: string): boolean {
  const lower = value.toLowerCase();
  const metadataTokenCount =
    lower.match(
      /\b(h264|h265|x264|x265|hevc|avc|aac|ac3|eac3|dts|truehd|bitrate|fps|progressive|interlaced|aspect|poster\.jpg|und|jpn|eng)\b/g,
    )?.length ?? 0;
  const numericCount = value.match(/\b\d+(?:\.\d+)?\b/g)?.length ?? 0;
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const hasPath = /(?:[a-z]:\\|\/[a-z0-9._-]+\/)/i.test(value);
  const hasTimestamp =
    /\b\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2})?)?\b/.test(value);
  const startsWithBoolean = /^(?:true|false)\b/i.test(value.trim());

  if (hasPath && hasTimestamp && numericCount >= 4) {
    return true;
  }

  if (metadataTokenCount >= 4 && numericCount >= 6 && wordCount >= 14) {
    return true;
  }

  if (startsWithBoolean && hasPath && numericCount >= 6) {
    return true;
  }

  return false;
}
