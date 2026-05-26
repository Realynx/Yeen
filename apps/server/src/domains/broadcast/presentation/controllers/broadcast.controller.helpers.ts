import type { Request, Response } from 'express';
import type { BroadcastPublicSessionStatus } from '../../domain/entities/broadcast-session.entity';

export function sendServiceUnavailable(
  response: Response,
  message: string,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Retry-After', '2');
  response.status(503).send({
    statusCode: 503,
    message,
    error: 'Service Unavailable',
  });
}

export function parseSourceEpoch(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function directMasterManifestPath(shareToken: string): string {
  return `/api/broadcast/public/${encodeURIComponent(shareToken)}/direct/master.m3u8`;
}

export function redirectToDirectMaster(
  response: Response,
  shareToken: string,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Location', directMasterManifestPath(shareToken));
  response.status(307).send();
}

export function resolveRequestBaseUrl(request: Request): string {
  const forwardedProto = request
    .header('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = request
    .header('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const protocol = forwardedProto || request.protocol || 'http';
  const host = forwardedHost || request.get('host') || '';

  return host ? `${protocol}://${host}` : '';
}

export function toManifestUri(
  pathOrUrl: string | null,
  requestBaseUrl = '',
): string | null {
  if (!pathOrUrl) {
    return null;
  }

  const resolved =
    !/^https?:\/\//i.test(pathOrUrl) &&
    pathOrUrl.startsWith('/') &&
    requestBaseUrl
      ? `${requestBaseUrl}${pathOrUrl}`
      : pathOrUrl;

  return resolved.replace(/"/g, '%22');
}

export function withDirectSubtitleQuery(
  pathOrUrl: string,
  status: BroadcastPublicSessionStatus,
): string {
  try {
    const parsed = new URL(pathOrUrl, 'http://localhost');
    parsed.searchParams.set('sourceEpoch', String(status.sourceEpoch));
    if (status.streamKey) {
      parsed.searchParams.set('stream', status.streamKey);
    }

    return /^https?:\/\//i.test(pathOrUrl)
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}`;
  } catch {
    const params = new URLSearchParams();
    params.set('sourceEpoch', String(status.sourceEpoch));
    if (status.streamKey) {
      params.set('stream', status.streamKey);
    }

    const separator = pathOrUrl.includes('?') ? '&' : '?';
    return `${pathOrUrl}${separator}${params.toString()}`;
  }
}

export function toPublicSubtitleUrl(
  trackUrl: string | null,
  shareToken: string,
): string | null {
  if (!trackUrl) {
    return null;
  }

  try {
    const parsed = new URL(trackUrl, 'http://localhost');
    const parts = parsed.pathname.split('/');

    if (
      parts.length < 6 ||
      parts[1] !== 'api' ||
      parts[2] !== 'subtitles' ||
      parts[3] !== 'file'
    ) {
      return trackUrl;
    }

    const fileName = parts.slice(5).join('/');
    if (!fileName) {
      return trackUrl;
    }

    return `/api/broadcast/public/${encodeURIComponent(shareToken)}/subtitles/${fileName}`;
  } catch {
    return trackUrl;
  }
}

export function buildPublicDirectMasterManifest(
  status: BroadcastPublicSessionStatus,
  requestBaseUrl: string,
  subtitleUrl: string | null,
): string {
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-INDEPENDENT-SEGMENTS',
  ];
  const subtitleManifestUrl = subtitleUrl
    ? toManifestUri(
        `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/${status.sourceEpoch}/subtitles.m3u8`,
        requestBaseUrl,
      )
    : null;

  if (subtitleManifestUrl) {
    lines.push(
      `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Broadcast Subtitles",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="${subtitleManifestUrl}"`,
    );
  }

  const subtitleAttribute = subtitleManifestUrl ? ',SUBTITLES="subs"' : '';
  lines.push(
    `#EXT-X-STREAM-INF:BANDWIDTH=4000000,CLOSED-CAPTIONS=NONE${subtitleAttribute}`,
  );
  lines.push(
    toManifestUri(
      `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/hls/${status.sourceEpoch}/master.m3u8`,
      requestBaseUrl,
    ) ?? '',
  );
  lines.push('');

  return lines.join('\n');
}

export function buildPublicDirectSubtitleManifest(
  subtitleUrl: string,
  requestBaseUrl: string,
  totalDurationSeconds: number,
): string {
  const resolvedSubtitleUrl = toManifestUri(subtitleUrl, requestBaseUrl);
  if (!resolvedSubtitleUrl) {
    return '#EXTM3U\n';
  }

  const durationSeconds =
    Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0
      ? totalDurationSeconds
      : 1;
  const targetDuration = Math.max(1, Math.ceil(durationSeconds));

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXTINF:${durationSeconds.toFixed(3)},`,
    resolvedSubtitleUrl,
    '#EXT-X-ENDLIST',
    '',
  ];

  return lines.join('\n');
}
