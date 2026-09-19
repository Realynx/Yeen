const DEFAULT_STATUS_STREAM_STALE_MS = 20_000;

export function shouldRefreshPublicBroadcastFallback(
  lastStreamStatusAtMs: number,
  nowMs: number,
  staleAfterMs = DEFAULT_STATUS_STREAM_STALE_MS,
): boolean {
  if (!Number.isFinite(lastStreamStatusAtMs) || lastStreamStatusAtMs <= 0) {
    return true;
  }

  return nowMs - lastStreamStatusAtMs >= staleAfterMs;
}
