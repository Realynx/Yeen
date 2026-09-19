import type { HlsSession } from '../../../infrastructure/stores/hls-session.store';

interface SelectHlsSessionsForEvictionOptions {
  sessions: HlsSession[];
  sessionBytes: ReadonlyMap<string, number>;
  maxBytes: number;
}

export function selectHlsSessionsForEvictionValue({
  sessions,
  sessionBytes,
  maxBytes,
}: SelectHlsSessionsForEvictionOptions): HlsSession[] {
  let retainedBytes = sessions.reduce(
    (total, session) => total + (sessionBytes.get(session.sessionId) ?? 0),
    0,
  );
  if (retainedBytes <= maxBytes) {
    return [];
  }

  const candidates = [...sessions].sort(
    (left, right) => lastAccessedAt(left) - lastAccessedAt(right),
  );
  const evicted: HlsSession[] = [];
  for (const session of candidates) {
    if (retainedBytes <= maxBytes) {
      break;
    }
    retainedBytes -= sessionBytes.get(session.sessionId) ?? 0;
    evicted.push(session);
  }
  return evicted;
}

function lastAccessedAt(session: HlsSession): number {
  return session.lastAccessedAtMs ?? (Date.parse(session.startedAt) || 0);
}
