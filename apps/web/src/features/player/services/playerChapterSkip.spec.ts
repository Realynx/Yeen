import { describe, expect, it } from 'vitest';
import type { MediaChapterThumbnail } from '../../shared/services/types';
import {
  buildChapterSkipSegments,
  resolveActiveChapterSkipAction,
  resolveChapterSkipKindFromName,
} from './playerChapterSkip';

function createChapter(
  second: number,
  name: string | null,
): MediaChapterThumbnail {
  return {
    imagePath: `/preview-${second}.webp`,
    second,
    name,
  };
}

describe('playerChapterSkip', () => {
  it('classifies intro and outro markers from common labels', () => {
    expect(resolveChapterSkipKindFromName('OP')).toBe('intro');
    expect(resolveChapterSkipKindFromName('OP 1')).toBe('intro');
    expect(resolveChapterSkipKindFromName('Intro')).toBe('intro');
    expect(resolveChapterSkipKindFromName('Opening Theme')).toBe('intro');
    expect(resolveChapterSkipKindFromName('Opening Scene')).toBeNull();
    expect(resolveChapterSkipKindFromName('Recap OP')).toBeNull();
    expect(resolveChapterSkipKindFromName('ED')).toBe('outro');
    expect(resolveChapterSkipKindFromName('OD1')).toBe('outro');
    expect(resolveChapterSkipKindFromName('Episode ED')).toBeNull();
    expect(resolveChapterSkipKindFromName('Credits')).toBe('outro');
    expect(resolveChapterSkipKindFromName('Chapter 03')).toBeNull();
  });

  it('builds actionable segments from chapter timeline', () => {
    const chapters = [
      createChapter(0, 'OP'),
      createChapter(88, 'Episode Start'),
      createChapter(1275, 'ED'),
    ];

    expect(buildChapterSkipSegments(chapters, 1320)).toEqual([
      {
        kind: 'intro',
        chapterName: 'OP',
        startSeconds: 0,
        endSeconds: 88,
        targetSeconds: 88,
      },
      {
        kind: 'outro',
        chapterName: 'ED',
        startSeconds: 1275,
        endSeconds: 1320,
        targetSeconds: 1320,
      },
    ]);
  });

  it('resolves active intro skip action inside intro window', () => {
    const chapters = [
      createChapter(0, 'Intro'),
      createChapter(42, 'OP'),
      createChapter(96, 'Episode'),
    ];

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 20,
        totalDuration: 1400,
      }),
    ).toBeNull();

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 55,
        totalDuration: 1400,
      }),
    ).toMatchObject({
      kind: 'intro',
      label: 'Skip Intro',
      chapterName: 'OP',
      targetSeconds: 96,
    });
  });

  it('does not show outro action before explicit outro marker begins', () => {
    const chapters = [
      createChapter(0, 'Episode'),
      createChapter(1180, 'Outro'),
      createChapter(1240, 'ED'),
    ];

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 1200,
        totalDuration: 1320,
      }),
    ).toBeNull();

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 1250,
        totalDuration: 1320,
      }),
    ).toMatchObject({
      kind: 'outro',
      label: 'Skip Outro',
      chapterName: 'ED',
      targetSeconds: 1320,
    });
  });

  it('resolves active outro skip action and jumps to media end', () => {
    const chapters = [
      createChapter(0, 'Episode'),
      createChapter(1290, 'OD'),
    ];

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 1302,
        totalDuration: 1320,
      }),
    ).toMatchObject({
      kind: 'outro',
      label: 'Skip Outro',
      chapterName: 'OD',
      targetSeconds: 1320,
    });
  });

  it('returns no action outside active segment boundaries', () => {
    const chapters = [
      createChapter(0, 'OP'),
      createChapter(80, 'Episode'),
      createChapter(1240, 'Credits'),
    ];

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 200,
        totalDuration: 1320,
      }),
    ).toBeNull();

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 79.9,
        totalDuration: 1320,
      }),
    ).toBeNull();

    expect(
      resolveActiveChapterSkipAction({
        chapters,
        currentTime: 1319.9,
        totalDuration: 1320,
      }),
    ).toBeNull();
  });
});
