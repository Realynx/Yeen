import { BadRequestException } from '@nestjs/common';

export function normalizeIptDownloadUrl(downloadUrl: string): string {
  const cleaned = downloadUrl.trim();
  if (!cleaned) {
    throw new BadRequestException('IPTorrents download URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new BadRequestException(
      'IPTorrents download URL must be a valid absolute URL.',
    );
  }

  if (!isIptorrentsHost(parsed.hostname)) {
    throw new BadRequestException(
      'Download URL must point to an IPTorrents host.',
    );
  }

  if (!/\/download\.php(?:\/|$)/i.test(parsed.pathname)) {
    throw new BadRequestException(
      'Download URL must use the IPTorrents download endpoint.',
    );
  }

  return parsed.toString();
}

export function resolveIptTorrentFileName(
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

  return sanitizeTorrentFileName(fallbackFileName || 'iptorrents-download');
}

function isIptorrentsHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'iptorrents.com' || normalized.endsWith('.iptorrents.com')
  );
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

  const withFallback = withoutIllegalChars || 'iptorrents-download';
  const trimmed = withFallback.slice(0, 160);
  return trimmed.toLowerCase().endsWith('.torrent')
    ? trimmed
    : `${trimmed}.torrent`;
}
