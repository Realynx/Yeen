import type {
  HlsSessionStats,
  HlsStartResponse,
  PlaybackAudioTrack,
  ProgressEntry,
  SubtitleTrack,
} from "./types";
import { jsonBody, request } from "./api-core";
import { publishProgressUpdate } from "./progressUpdates";

interface HlsSessionOptions {
  forceFresh?: boolean;
  audioStreamIndex?: number | null;
  maxVideoBitrateKbps?: number | null;
  audioBitrateKbps?: number | null;
  maxOutputHeight?: number | null;
}

function appendPositiveInteger(
  params: URLSearchParams,
  key: string,
  value: number | null | undefined,
  allowZero = false,
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return;
  }

  if (allowZero ? value < 0 : value <= 0) {
    return;
  }

  params.set(key, String(value));
}

function createHlsSessionParams(options?: HlsSessionOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options?.forceFresh) {
    params.set("force", "1");
  }

  appendPositiveInteger(
    params,
    "audioStreamIndex",
    options?.audioStreamIndex,
    true,
  );
  appendPositiveInteger(
    params,
    "maxVideoBitrateKbps",
    options?.maxVideoBitrateKbps,
  );
  appendPositiveInteger(params, "audioBitrateKbps", options?.audioBitrateKbps);
  appendPositiveInteger(params, "maxOutputHeight", options?.maxOutputHeight);
  return params;
}

export async function startHlsSession(
  token: string,
  mediaId: string,
  options?: HlsSessionOptions,
) {
  const params = createHlsSessionParams(options);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<HlsStartResponse>(
    `/stream/${mediaId}/hls/start${suffix}`,
    { method: "POST" },
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
    { method: "GET" },
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

export async function extractSubtitle(
  token: string,
  mediaId: string,
  streamIndex: number,
) {
  return request<{ mediaId: string; streamIndex: number; url: string }>(
    `/subtitles/${mediaId}/extract`,
    {
      method: "POST",
      body: jsonBody({ streamIndex }),
    },
    token,
  );
}

export async function listProgress(token: string) {
  return request<ProgressEntry[]>("/progress", { cache: "no-store" }, token);
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
  const progress = await request<ProgressEntry>(
    `/progress/${mediaId}`,
    {
      method: "PUT",
      body: jsonBody(payload),
      keepalive: options?.keepalive,
      cache: "no-store",
    },
    token,
  );
  publishProgressUpdate(progress);
  return progress;
}
