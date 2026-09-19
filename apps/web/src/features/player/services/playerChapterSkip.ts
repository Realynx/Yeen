import type { MediaChapterThumbnail } from '../../shared/services/types';
import { clamp } from './playerUtils';

const EXPLICIT_INTRO_LABEL_PATTERN =
  /^(?:op(?:\s*\d+)?|opening(?:\s+(?:theme|song|credits?|title|sequence|animation)))(?:\s+(?:start|begin(?:ning)?))?$/i;
const GENERIC_INTRO_LABEL_PATTERN =
  /^intro(?:duction)?(?:\s+(?:theme|song|credits?|title|sequence|animation|start|begin(?:ning)?))?$/i;
const EXPLICIT_OUTRO_LABEL_PATTERN =
  /^(?:(?:ed|od)(?:\s*\d+)?|ending(?:\s+(?:theme|song|credits?|title|sequence|animation)))(?:\s+(?:start|begin(?:ning)?))?$/i;
const GENERIC_OUTRO_LABEL_PATTERN =
  /^(?:outro|ending|credits?|end\s+credits?)(?:\s+(?:start|begin(?:ning)?))?$/i;
const MIN_ACTIONABLE_SEGMENT_SECONDS = 2;
const SEGMENT_EDGE_TOLERANCE_SECONDS = 0.35;

type ChapterSkipMarkerKind =
  | 'intro_explicit'
  | 'intro_generic'
  | 'outro_explicit'
  | 'outro_generic';

export type ChapterSkipKind = 'intro' | 'outro';

export interface ChapterSkipSegment {
  kind: ChapterSkipKind;
  chapterName: string | null;
  startSeconds: number;
  endSeconds: number;
  targetSeconds: number;
}

export interface ChapterSkipAction {
  kind: ChapterSkipKind;
  label: 'Skip Intro' | 'Skip Outro';
  chapterName: string | null;
  startSeconds: number;
  endSeconds: number;
  targetSeconds: number;
}

interface ClassifiedChapter {
  chapter: { second: number; name: string | null };
  markerKind: ChapterSkipMarkerKind | null;
}

function shouldSkipMarker(
  markerKind: ChapterSkipMarkerKind,
  hasExplicitIntroMarker: boolean,
  hasExplicitOutroMarker: boolean,
): boolean {
  return (markerKind === 'intro_generic' && hasExplicitIntroMarker)
    || (markerKind === 'outro_generic' && hasExplicitOutroMarker);
}

function createSkipSegment(
  entry: ClassifiedChapter,
  nextChapterStart: number | null,
  maxDuration: number | null,
): ChapterSkipSegment | null {
  const { chapter, markerKind } = entry;
  if (!markerKind) return null;
  const kind: ChapterSkipKind = markerKind.startsWith('intro') ? 'intro' : 'outro';
  const endSeconds = maxDuration === null
    ? nextChapterStart ?? chapter.second
    : clamp(nextChapterStart ?? maxDuration, 0, maxDuration);
  const targetSeconds = kind === 'outro' ? maxDuration ?? endSeconds : endSeconds;
  if (endSeconds - chapter.second < MIN_ACTIONABLE_SEGMENT_SECONDS
      || targetSeconds <= chapter.second + SEGMENT_EDGE_TOLERANCE_SECONDS) {
    return null;
  }
  return {
    kind,
    chapterName: chapter.name,
    startSeconds: chapter.second,
    endSeconds,
    targetSeconds,
  };
}

export function resolveChapterSkipKindFromName(
  chapterName: string | null | undefined,
): ChapterSkipKind | null {
  const markerKind = resolveChapterSkipMarkerKind(chapterName);
  if (!markerKind) {
    return null;
  }

  return markerKind.startsWith('intro') ? 'intro' : 'outro';
}

export function buildChapterSkipSegments(
  chapters: readonly MediaChapterThumbnail[] | null | undefined,
  totalDuration: number,
): ChapterSkipSegment[] {
  const sortedChapters = normalizeChapterTimeline(chapters, totalDuration);
  if (sortedChapters.length === 0) {
    return [];
  }

  const maxDuration =
    Number.isFinite(totalDuration) && totalDuration > 0
      ? totalDuration
      : null;

  const classifiedChapters = sortedChapters.map((chapter) => ({
    chapter,
    markerKind: resolveChapterSkipMarkerKind(chapter.name),
  }));
  const hasExplicitIntroMarker = classifiedChapters.some(
    (entry) => entry.markerKind === 'intro_explicit',
  );
  const hasExplicitOutroMarker = classifiedChapters.some(
    (entry) => entry.markerKind === 'outro_explicit',
  );

  const segments = classifiedChapters.flatMap((entry, index) => {
    if (!entry.markerKind
        || shouldSkipMarker(entry.markerKind, hasExplicitIntroMarker, hasExplicitOutroMarker)) {
      return [];
    }
    const segment = createSkipSegment(
      entry,
      classifiedChapters[index + 1]?.chapter.second ?? null,
      maxDuration,
    );
    return segment ? [segment] : [];
  });

  return segments;
}

export function resolveActiveChapterSkipAction(input: {
  chapters: readonly MediaChapterThumbnail[] | null | undefined;
  currentTime: number;
  totalDuration: number;
}): ChapterSkipAction | null {
  const segments = buildChapterSkipSegments(input.chapters, input.totalDuration);
  if (segments.length === 0) {
    return null;
  }

  const boundedTime =
    Number.isFinite(input.totalDuration) && input.totalDuration > 0
      ? clamp(input.currentTime, 0, input.totalDuration)
      : Math.max(0, input.currentTime);

  for (const segment of segments) {
    if (
      boundedTime < segment.startSeconds + SEGMENT_EDGE_TOLERANCE_SECONDS ||
      boundedTime >= segment.endSeconds - SEGMENT_EDGE_TOLERANCE_SECONDS
    ) {
      continue;
    }

    return {
      ...segment,
      label: segment.kind === 'intro' ? 'Skip Intro' : 'Skip Outro',
    };
  }

  return null;
}

function normalizeChapterTimeline(
  chapters: readonly MediaChapterThumbnail[] | null | undefined,
  totalDuration: number,
): Array<{ second: number; name: string | null }> {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const maxDuration =
    Number.isFinite(totalDuration) && totalDuration > 0
      ? totalDuration
      : null;

  const normalized = chapters
    .map((chapter) => {
      if (!Number.isFinite(chapter.second) || chapter.second < 0) {
        return null;
      }

      const second =
        maxDuration !== null
          ? clamp(chapter.second, 0, maxDuration)
          : chapter.second;

      const name =
        typeof chapter.name === 'string' && chapter.name.trim()
          ? chapter.name.trim()
          : null;

      return {
        second,
        name,
      };
    })
    .filter((chapter): chapter is { second: number; name: string | null } => chapter !== null)
    .sort((left, right) => left.second - right.second);

  const deduped: Array<{ second: number; name: string | null }> = [];

  for (const chapter of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.second - chapter.second) < 0.01) {
      if (!previous.name && chapter.name) {
        previous.name = chapter.name;
      }
      continue;
    }

    deduped.push({ ...chapter });
  }

  return deduped;
}

function resolveChapterSkipMarkerKind(
  chapterName: string | null | undefined,
): ChapterSkipMarkerKind | null {
  if (typeof chapterName !== 'string') {
    return null;
  }

  const normalized = normalizeChapterName(chapterName);
  if (!normalized) {
    return null;
  }

  if (EXPLICIT_INTRO_LABEL_PATTERN.test(normalized)) {
    return 'intro_explicit';
  }

  if (GENERIC_INTRO_LABEL_PATTERN.test(normalized)) {
    return 'intro_generic';
  }

  if (EXPLICIT_OUTRO_LABEL_PATTERN.test(normalized)) {
    return 'outro_explicit';
  }

  if (GENERIC_OUTRO_LABEL_PATTERN.test(normalized)) {
    return 'outro_generic';
  }

  return null;
}

function normalizeChapterName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
