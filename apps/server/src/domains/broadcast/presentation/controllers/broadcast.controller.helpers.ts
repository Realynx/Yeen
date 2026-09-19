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
  const lines = ['#EXTM3U', '#EXT-X-VERSION:6', '#EXT-X-INDEPENDENT-SEGMENTS'];
  const subtitleManifestUrl = subtitleUrl
    ? toManifestUri(
        `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/live/subtitles.m3u8`,
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
      `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/live/master.m3u8`,
      requestBaseUrl,
    ) ?? '',
  );
  lines.push('');

  return lines.join('\n');
}

export function buildPublicDirectRootManifest(
  manifest: string,
  status: BroadcastPublicSessionStatus,
  requestBaseUrl: string,
  subtitleUrl: string | null,
): string {
  const lines = manifest.split(/\r?\n/);
  const isMultivariant = lines.some((line) =>
    line.trim().startsWith('#EXT-X-STREAM-INF:'),
  );
  if (!isMultivariant) {
    return buildPublicDirectMasterManifest(status, requestBaseUrl, subtitleUrl);
  }

  const directLiveBase = `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/live`;
  const subtitleManifestUrl = subtitleUrl
    ? toManifestUri(
        `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/live/subtitles.m3u8`,
        requestBaseUrl,
      )
    : null;
  const output: string[] = [];
  let subtitleRenditionAdded = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
      if (subtitleManifestUrl && !subtitleRenditionAdded) {
        output.push(
          `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Broadcast Subtitles",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="${subtitleManifestUrl}"`,
        );
        subtitleRenditionAdded = true;
      }
      const muxedVariant = removeManifestAttribute(line, 'AUDIO');
      output.push(
        subtitleManifestUrl && !muxedVariant.includes('SUBTITLES=')
          ? `${muxedVariant},SUBTITLES="subs"`
          : muxedVariant,
      );
      continue;
    }

    if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('TYPE=AUDIO')) {
      continue;
    }

    if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('URI="')) {
      output.push(
        line.replace(/URI="([^"\r\n]+)"/g, (_match, uri: string) => {
          const resolved = toManifestUri(
            `${directLiveBase}/${encodeURIComponent(uri)}`,
            requestBaseUrl,
          );
          return `URI="${resolved ?? uri}"`;
        }),
      );
      continue;
    }

    if (trimmed && !trimmed.startsWith('#')) {
      output.push(
        toManifestUri(
          `${directLiveBase}/${encodeURIComponent(trimmed)}`,
          requestBaseUrl,
        ) ?? line,
      );
      continue;
    }

    output.push(line);
  }

  while (output.length > 0 && output.at(-1) === '') {
    output.pop();
  }
  output.push('');
  return output.join('\n');
}

function removeManifestAttribute(line: string, attribute: string): string {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return line
    .replace(new RegExp(`,?${escapedAttribute}=(?:"[^"]*"|[^,]*)`, 'g'), '')
    .replace(':,', ':');
}

export function buildPublicDirectLiveManifest(
  manifest: string,
  shareToken: string,
  sourceEpoch: number,
  window?: { startSegmentIndex: number; maxSegments: number },
): string {
  const normalizedEpoch =
    Number.isSafeInteger(sourceEpoch) && sourceEpoch >= 0 ? sourceEpoch : 0;
  const segmentBase = `/api/broadcast/public/${encodeURIComponent(shareToken)}/direct/hls/${normalizedEpoch}`;
  const { header, segments } = splitMediaManifest(manifest);
  const maxSegments = normalizePositiveInteger(
    window?.maxSegments,
    segments.length,
  );
  const requestedStart = normalizeNonNegativeInteger(window?.startSegmentIndex);
  const maxStart = Math.max(0, segments.length - maxSegments);
  const startSegmentIndex = Math.min(requestedStart, maxStart);
  const selectedSegments = segments.slice(
    startSegmentIndex,
    startSegmentIndex + maxSegments,
  );
  const mediaSequence = normalizedEpoch * 1_000_000 + startSegmentIndex;
  const output = rewriteDirectLiveHeader(
    header,
    mediaSequence,
    normalizedEpoch,
  );

  for (const segment of selectedSegments) {
    output.push(...segment.tags);
    output.push(`${segmentBase}/${encodeURIComponent(segment.uri)}`);
  }

  while (output.length > 0 && output.at(-1) === '') {
    output.pop();
  }
  output.push('');
  return output.join('\n');
}

interface MediaManifestSegment {
  tags: string[];
  uri: string;
}

function splitMediaManifest(manifest: string): {
  header: string[];
  segments: MediaManifestSegment[];
} {
  const header: string[] = [];
  const segments: MediaManifestSegment[] = [];
  let pendingSegmentTags: string[] | null = null;

  for (const line of manifest.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      pendingSegmentTags = [line];
      continue;
    }

    if (pendingSegmentTags) {
      if (trimmed && !trimmed.startsWith('#')) {
        segments.push({ tags: pendingSegmentTags, uri: trimmed });
        pendingSegmentTags = null;
      } else if (trimmed && trimmed !== '#EXT-X-ENDLIST') {
        pendingSegmentTags.push(line);
      }
      continue;
    }

    if (
      trimmed === '#EXT-X-PLAYLIST-TYPE:VOD' ||
      trimmed === '#EXT-X-ENDLIST' ||
      trimmed.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:') ||
      trimmed.startsWith('#EXT-X-START:')
    ) {
      continue;
    }

    header.push(line);
  }

  return { header, segments };
}

function rewriteDirectLiveHeader(
  header: string[],
  mediaSequence: number,
  sourceEpoch: number,
): string[] {
  const output: string[] = [];
  let replacedMediaSequence = false;

  for (const line of header) {
    if (line.trim().startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      output.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`);
      output.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${sourceEpoch}`);
      output.push('#EXT-X-START:TIME-OFFSET=0,PRECISE=YES');
      replacedMediaSequence = true;
    } else if (line.trim()) {
      output.push(line);
    }
  }

  if (!replacedMediaSequence) {
    output.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`);
    output.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${sourceEpoch}`);
    output.push('#EXT-X-START:TIME-OFFSET=0,PRECISE=YES');
  }

  return output;
}

function normalizeNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : Math.max(1, fallback);
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

export function buildPublicDirectLiveSubtitleManifest(
  subtitleUrl: string,
  requestBaseUrl: string,
  sourceEpoch: number,
): string {
  const resolvedSubtitleUrl = toManifestUri(subtitleUrl, requestBaseUrl);
  if (!resolvedSubtitleUrl) {
    return '#EXTM3U\n';
  }

  const normalizedEpoch = normalizeNonNegativeInteger(sourceEpoch);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:6',
    '#EXT-X-TARGETDURATION:3',
    `#EXT-X-MEDIA-SEQUENCE:${normalizedEpoch * 1_000_000}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${normalizedEpoch}`,
    '#EXTINF:3.000,',
    resolvedSubtitleUrl,
    '',
  ];

  return lines.join('\n');
}
