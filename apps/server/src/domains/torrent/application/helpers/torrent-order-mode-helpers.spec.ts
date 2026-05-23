import {
  buildTorrentOrderModeMessage,
  buildTorrentOrderTogglePlan,
  hasToggleableOrderFlags,
  isSequentialOrderEnforced,
  resolveTorrentOrderModeFromRequest,
} from './torrent-order-mode-helpers';

describe('torrent-order-mode-helpers', () => {
  it('detects whether torrent flags are toggleable booleans', () => {
    expect(hasToggleableOrderFlags(null)).toBe(false);

    expect(
      hasToggleableOrderFlags({
        sequentialDownload: null,
        firstLastPiecePriority: true,
      }),
    ).toBe(false);

    expect(
      hasToggleableOrderFlags({
        sequentialDownload: false,
        firstLastPiecePriority: true,
      }),
    ).toBe(true);
  });

  it('builds sequential toggle plan from current flags', () => {
    expect(
      buildTorrentOrderTogglePlan({
        orderMode: 'sequential',
        sequentialDownload: false,
        firstLastPiecePriority: false,
      }),
    ).toEqual({
      desiredSequential: true,
      desiredFirstLastPiecePriority: true,
      sequentialChanged: true,
      firstLastPiecePriorityChanged: true,
    });
  });

  it('builds random toggle plan from current flags', () => {
    expect(
      buildTorrentOrderTogglePlan({
        orderMode: 'random',
        sequentialDownload: true,
        firstLastPiecePriority: false,
      }),
    ).toEqual({
      desiredSequential: false,
      desiredFirstLastPiecePriority: false,
      sequentialChanged: true,
      firstLastPiecePriorityChanged: false,
    });
  });

  it('checks whether sequential mode is fully enforced', () => {
    expect(
      isSequentialOrderEnforced({
        sequentialDownload: true,
        firstLastPiecePriority: true,
      }),
    ).toBe(true);

    expect(
      isSequentialOrderEnforced({
        sequentialDownload: true,
        firstLastPiecePriority: false,
      }),
    ).toBe(false);
  });

  it('returns user-facing order-mode messages', () => {
    expect(buildTorrentOrderModeMessage('sequential')).toBe(
      'Torrent switched to sequential piece order.',
    );
    expect(buildTorrentOrderModeMessage('random')).toBe(
      'Torrent switched to random piece order.',
    );
  });

  it('resolves order mode from explicit request setting first', () => {
    expect(
      resolveTorrentOrderModeFromRequest({
        orderMode: 'random',
        intent: 'stream',
      }),
    ).toBe('random');
  });

  it('resolves order mode from stream/background intent', () => {
    expect(
      resolveTorrentOrderModeFromRequest({
        orderMode: null,
        intent: 'stream',
      }),
    ).toBe('sequential');
    expect(
      resolveTorrentOrderModeFromRequest({
        orderMode: null,
        intent: 'background',
      }),
    ).toBe('random');
  });

  it('returns null when request does not specify order preference', () => {
    expect(
      resolveTorrentOrderModeFromRequest({
        orderMode: null,
        intent: null,
      }),
    ).toBeNull();
  });
});
