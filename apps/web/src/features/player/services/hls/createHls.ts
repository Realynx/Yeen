import Hls, { type HlsConfig } from 'hls.js';
import {
  readStoredAccessToken,
  withAccessToken,
} from '../../../shared/services/api-core';

export function withLatestHlsAccessToken(
  url: string,
  token = readStoredAccessToken(),
): string {
  return token ? withAccessToken(url, token) : url;
}

/**
 * Builds the Hls.js config used by the player.
 *
 * Tuned for an on-demand transcoding server: a slow first segment or brief
 * stall must not become fatal. `startPosition: -1` is critical — hard-coding 0
 * makes <video> seek to currentTime=0 and stall forever when the first
 * segment's PTS is non-zero (common with MPEG-TS output).
 */
const HLS_CONFIG: Partial<HlsConfig> = {
  xhrSetup(xhr, url) {
    const authenticatedUrl = withLatestHlsAccessToken(url);
    if (authenticatedUrl !== url) {
      xhr.open('GET', authenticatedUrl, true);
    }
  },
  startPosition: -1,
  lowLatencyMode: false,
  manifestLoadingMaxRetry: 8,
  manifestLoadingRetryDelay: 1000,
  manifestLoadingTimeOut: 20000,
  levelLoadingMaxRetry: 8,
  levelLoadingRetryDelay: 1000,
  levelLoadingTimeOut: 20000,
  fragLoadingMaxRetry: 8,
  fragLoadingRetryDelay: 1000,
  fragLoadingTimeOut: 60000,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  // On-demand transcoded segments are produced independently, so adjacent
  // segments can leave sub-frame buffer holes (CFR rounding + per-segment AAC
  // priming). Give hls.js more room to bridge and nudge across those holes so
  // they don't stall playback or trigger a premature end-of-stream.
  maxBufferHole: 0.5,
  nudgeOffset: 0.2,
  nudgeMaxRetry: 6,
  highBufferWatchdogPeriod: 2,
};

export function createHlsInstance(overrides: Partial<HlsConfig> = {}): Hls {
  return new Hls({ ...HLS_CONFIG, ...overrides });
}
