export function isNyaaHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'nyaa.si' || normalized.endsWith('.nyaa.si');
}

export function resolveNyaaTorrentFileName(
  response: Response,
  sourceUrl: string,
  fallbackFileName?: string,
): string {
  const fromHeader = parseFileNameFromContentDisposition(
    response.headers.get('content-disposition'),
  );
  if (fromHeader) {
    return sanitizeTorrentFileName(fromHeader);
  }

  try {
    const finalUrl = new URL(response.url || sourceUrl);
    const pathTail = finalUrl.pathname.split('/').pop();
    if (pathTail) {
      return sanitizeTorrentFileName(decodeURIComponent(pathTail));
    }
  } catch {
    // Fall back to title-derived file names.
  }

  return sanitizeTorrentFileName(fallbackFileName || 'nyaa-download');
}

function parseFileNameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    const encoded = utf8Match[1].trim().replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  const simpleMatch = header.match(/filename="?([^";]+)"?/i);
  return simpleMatch?.[1]?.trim() || null;
}

function sanitizeTorrentFileName(value: string): string {
  const withoutIllegalChars = value
    .replace(/[\\/:*?"<>|%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  const withFallback = withoutIllegalChars || 'nyaa-download';
  const trimmed = withFallback.slice(0, 160);
  return trimmed.toLowerCase().endsWith('.torrent')
    ? trimmed
    : `${trimmed}.torrent`;
}
