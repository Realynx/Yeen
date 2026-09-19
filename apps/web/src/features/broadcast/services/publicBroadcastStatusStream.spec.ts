import { describe, expect, it } from 'vitest';
import { parsePublicBroadcastStatusEvent } from './publicBroadcastStatusStream';

describe('public broadcast status stream', () => {
  it('accepts an authoritative status event', () => {
    expect(parsePublicBroadcastStatusEvent(JSON.stringify({
      enabled: true,
      isLive: false,
      sourceEpoch: 9,
      shareToken: 'broadcast-token',
    }))).toMatchObject({ sourceEpoch: 9, isLive: false });
  });

  it('rejects malformed events without disturbing the active player', () => {
    expect(parsePublicBroadcastStatusEvent('{')).toBeNull();
    expect(parsePublicBroadcastStatusEvent(JSON.stringify({ enabled: true }))).toBeNull();
  });
});
