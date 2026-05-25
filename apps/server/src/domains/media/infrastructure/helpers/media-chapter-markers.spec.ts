import { normalizeFfprobeChapterMarkers } from './media-chapter-markers';

describe('normalizeFfprobeChapterMarkers', () => {
  it('returns an empty list when no chapters are provided', () => {
    expect(normalizeFfprobeChapterMarkers(undefined, 300)).toEqual([]);
    expect(normalizeFfprobeChapterMarkers([], 300)).toEqual([]);
  });

  it('parses start_time and keeps explicit chapter titles', () => {
    const markers = normalizeFfprobeChapterMarkers(
      [
        {
          start_time: '12.42',
          tags: {
            title: 'Arrival',
          },
        },
        {
          start_time: '65.0',
          tags: {
            title: '  Chase  ',
          },
        },
      ],
      300,
    );

    expect(markers).toEqual([
      { second: 12.42, name: 'Arrival' },
      { second: 65, name: 'Chase' },
    ]);
  });

  it('parses start plus time_base and fills missing names', () => {
    const markers = normalizeFfprobeChapterMarkers(
      [
        {
          start: '2400',
          time_base: '1/1000',
        },
        {
          start: '8400',
          time_base: '1/1000',
        },
      ],
      300,
    );

    expect(markers).toEqual([
      { second: 2.4, name: 'Chapter 1' },
      { second: 8.4, name: 'Chapter 2' },
    ]);
  });

  it('deduplicates near-equal seconds and clamps to duration', () => {
    const markers = normalizeFfprobeChapterMarkers(
      [
        {
          start_time: '10.001',
          tags: {
            title: 'Intro',
          },
        },
        {
          start_time: '10.006',
          tags: {
            title: 'Intro Duplicate',
          },
        },
        {
          start_time: '999.5',
          tags: {
            title: 'Finale',
          },
        },
      ],
      100,
    );

    expect(markers).toEqual([
      { second: 10.001, name: 'Intro' },
      { second: 99.8, name: 'Finale' },
    ]);
  });
});
