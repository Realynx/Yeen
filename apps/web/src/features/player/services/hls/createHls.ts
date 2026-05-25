import Hls, { type HlsConfig } from 'hls.js';

/**
 * Builds the Hls.js config used by the player.
 *
 * Tuned for an on-demand transcoding server: a slow first segment or brief
 * stall must not become fatal. `startPosition: -1` is critical — hard-coding 0
 * makes <video> seek to currentTime=0 and stall forever when the first
 * segment's PTS is non-zero (common with MPEG-TS output).
 */
const HLS_CONFIG: Partial<HlsConfig> = {
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
};

export function createHlsInstance(): Hls {
  return new Hls(HLS_CONFIG);
}
