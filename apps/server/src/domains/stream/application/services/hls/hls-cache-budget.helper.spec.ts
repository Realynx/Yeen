import type { HlsSession } from '../../../infrastructure/stores/hls-session.store';
import { selectHlsSessionsForEvictionValue } from './hls-cache-budget.helper';

function session(sessionId: string, lastAccessedAtMs: number): HlsSession {
  return {
    sessionId,
    lastAccessedAtMs,
  } as HlsSession;
}

describe('selectHlsSessionsForEvictionValue', () => {
  it('evicts least-recently-used sessions until the cache is under budget', () => {
    const oldest = session('oldest', 100);
    const middle = session('middle', 200);
    const newest = session('newest', 300);

    expect(
      selectHlsSessionsForEvictionValue({
        sessions: [newest, oldest, middle],
        sessionBytes: new Map([
          ['oldest', 600],
          ['middle', 500],
          ['newest', 400],
        ]),
        maxBytes: 900,
      }).map((candidate) => candidate.sessionId),
    ).toEqual(['oldest']);
  });

  it('does nothing when the total cache is already within budget', () => {
    const only = session('only', 100);
    expect(
      selectHlsSessionsForEvictionValue({
        sessions: [only],
        sessionBytes: new Map([['only', 500]]),
        maxBytes: 500,
      }),
    ).toEqual([]);
  });
});
