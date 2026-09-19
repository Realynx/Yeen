import { BroadcastDirectStreamTimeline } from './broadcast-direct-stream-timeline.service';

describe('BroadcastDirectStreamTimeline', () => {
  it('advances while browser playback is paused and resets for a new source epoch', () => {
    const timeline = new BroadcastDirectStreamTimeline();

    expect(timeline.resolveWindow('share-token', 4, 3, 100, 42, 1_000)).toEqual(
      {
        startSegmentIndex: 14,
        maxSegments: 10,
      },
    );
    expect(
      timeline.resolveWindow('share-token', 4, 3, 100, 42, 10_000),
    ).toEqual({
      startSegmentIndex: 17,
      maxSegments: 10,
    });
    expect(
      timeline.resolveWindow('share-token', 5, 3, 100, 90, 10_001),
    ).toEqual({
      startSegmentIndex: 30,
      maxSegments: 10,
    });
  });

  it('keeps the next required segment available after a delayed playlist refresh', () => {
    const timeline = new BroadcastDirectStreamTimeline();
    const firstWindow = timeline.resolveWindow(
      'slow-viewer',
      8,
      3,
      100,
      42,
      1_000,
    );
    const delayedWindow = timeline.resolveWindow(
      'slow-viewer',
      8,
      3,
      100,
      42,
      13_000,
    );
    const nextRequiredSegment =
      firstWindow.startSegmentIndex + firstWindow.maxSegments;

    expect(delayedWindow.startSegmentIndex).toBeLessThanOrEqual(
      nextRequiredSegment,
    );
    expect(
      delayedWindow.startSegmentIndex + delayedWindow.maxSegments,
    ).toBeGreaterThan(nextRequiredSegment);
  });
});
