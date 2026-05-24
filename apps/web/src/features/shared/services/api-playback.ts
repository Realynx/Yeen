import type {
  HlsSessionStats,
  HlsStartResponse,
  MediaTorrentDownloadProgressEntry,
  PlaybackAudioTrack,
  ProgressEntry,
  SubtitleTrack,
} from './types';
import { jsonBody, request } from './api-core';

export async function startHlsSession(
  token: string,
  mediaId: string,
  options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  },
) {
  const params = new URLSearchParams();

  if (options?.forceFresh) {
    params.set('force', '1');
  }

  if (
    typeof options?.audioStreamIndex === 'number'
    && Number.isInteger(options.audioStreamIndex)
    && options.audioStreamIndex >= 0
  ) {
    params.set('audioStreamIndex', String(options.audioStreamIndex));
  }

  if (
    typeof options?.maxVideoBitrateKbps === 'number'
    && Number.isInteger(options.maxVideoBitrateKbps)
    && options.maxVideoBitrateKbps > 0
  ) {
    params.set('maxVideoBitrateKbps', String(options.maxVideoBitrateKbps));
  }

  if (
    typeof options?.audioBitrateKbps === 'number'
    && Number.isInteger(options.audioBitrateKbps)
    && options.audioBitrateKbps > 0
  ) {
    params.set('audioBitrateKbps', String(options.audioBitrateKbps));
  }

  if (
    typeof options?.maxOutputHeight === 'number'
    && Number.isInteger(options.maxOutputHeight)
    && options.maxOutputHeight > 0
  ) {
    params.set('maxOutputHeight', String(options.maxOutputHeight));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<HlsStartResponse>(
    `/stream/${mediaId}/hls/start${suffix}`,
    { method: 'POST' },
    token,
  );
}

export async function listPlaybackAudioTracks(token: string, mediaId: string) {
  const payload = await request<{ tracks: PlaybackAudioTrack[] }>(
    `/stream/${mediaId}/audio-tracks`,
    {},
    token,
  );
  return payload.tracks;
}

export async function getHlsSessionStats(token: string, sessionId: string) {
  return request<HlsSessionStats>(
    `/stream/hls/${encodeURIComponent(sessionId)}/debug/stats`,
    { method: 'GET' },
    token,
  );
}

export async function listSubtitleTracks(token: string, mediaId: string) {
  const payload = await request<{ tracks: SubtitleTrack[] }>(
    `/subtitles/${mediaId}`,
    {},
    token,
  );
  return payload.tracks;
}

export async function extractSubtitle(token: string, mediaId: string, streamIndex: number) {
  return request<{ mediaId: string; streamIndex: number; url: string }>(
    `/subtitles/${mediaId}/extract`,
    {
      method: 'POST',
      body: jsonBody({ streamIndex }),
    },
    token,
  );
}

export async function listProgress(token: string) {
  return request<ProgressEntry[]>('/progress', { cache: 'no-store' }, token);
}

export async function listMediaTorrentDownloadProgress(
  token: string,
  mediaIds: string[],
) {
  const normalizedMediaIds = [...new Set(
    mediaIds
      .map((mediaId) => mediaId.trim())
      .filter((mediaId) => mediaId.length > 0),
  )];

  if (normalizedMediaIds.length === 0) {
    return { items: [] as MediaTorrentDownloadProgressEntry[] };
  }

  return request<{ items: MediaTorrentDownloadProgressEntry[] }>(
    '/media/torrent/download-progress',
    {
      method: 'POST',
      body: jsonBody({ mediaIds: normalizedMediaIds }),
    },
    token,
  );
}

export async function upsertProgress(
  token: string,
  mediaId: string,
  payload: {
    positionSeconds: number;
    durationSeconds: number;
    syncTimestampMs?: number;
    completed?: boolean;
    seriesPreferenceKey?: string | null;
    preferredAudioLanguage?: string | null;
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  },
  options?: {
    keepalive?: boolean;
  },
) {
  return request<ProgressEntry>(`/progress/${mediaId}`, {
    method: 'PUT',
    body: jsonBody(payload),
    keepalive: options?.keepalive,
    cache: 'no-store',
  }, token);
}
