import { computePrefetchSegmentIndicesValue } from './hls-segment-prefetch.helper';

describe('computePrefetchSegmentIndicesValue', () => {
  it('targets the same media duration for short and long segments', () => {
    expect(computePrefetchSegmentIndicesValue(0, 3, 100, 30)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(computePrefetchSegmentIndicesValue(0, 10, 100, 30)).toEqual([1, 2]);
  });

  it('clamps the rolling window at the final segment', () => {
    expect(computePrefetchSegmentIndicesValue(8, 3, 10, 30)).toEqual([9]);
    expect(computePrefetchSegmentIndicesValue(9, 3, 10, 30)).toEqual([]);
  });
});
