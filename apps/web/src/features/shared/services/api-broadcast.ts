import type {
  BroadcastOwnerSession,
  BroadcastPlaybackUpdate,
  BroadcastPublicSession,
  BroadcastSourceUpdate,
  SubtitleTrack,
  BroadcastViewerHeartbeatResponse,
} from './types';
import { jsonBody, request } from './api-core';

export async function getBroadcastSession(token: string) {
  return request<BroadcastOwnerSession>('/broadcast/session', { method: 'GET' }, token);
}

export async function setBroadcastEnabled(
  token: string,
  enabled: boolean,
) {
  return request<BroadcastOwnerSession>(
    '/broadcast/enabled',
    {
      method: 'PUT',
      body: jsonBody({ enabled }),
    },
    token,
  );
}

export async function updateBroadcastSource(
  token: string,
  payload: BroadcastSourceUpdate,
) {
  return request<BroadcastOwnerSession>(
    '/broadcast/source',
    {
      method: 'PUT',
      body: jsonBody(payload),
    },
    token,
  );
}

export async function updateBroadcastPlayback(
  token: string,
  payload: BroadcastPlaybackUpdate,
) {
  return request<BroadcastOwnerSession>(
    '/broadcast/playback',
    {
      method: 'PUT',
      body: jsonBody(payload),
    },
    token,
  );
}

export async function getPublicBroadcastSession(shareToken: string) {
  return request<BroadcastPublicSession>(
    `/broadcast/public/${encodeURIComponent(shareToken)}`,
    { method: 'GET', cache: 'no-store' },
  );
}

export async function heartbeatPublicBroadcastViewer(
  shareToken: string,
  viewerId?: string,
) {
  return request<BroadcastViewerHeartbeatResponse>(
    `/broadcast/public/${encodeURIComponent(shareToken)}/heartbeat`,
    {
      method: 'POST',
      body: jsonBody({ viewerId }),
      cache: 'no-store',
    },
  );
}

export async function getPublicBroadcastSubtitleTracks(shareToken: string) {
  return request<{ tracks: SubtitleTrack[] }>(
    `/broadcast/public/${encodeURIComponent(shareToken)}/subtitles`,
    { method: 'GET', cache: 'no-store' },
  );
}
