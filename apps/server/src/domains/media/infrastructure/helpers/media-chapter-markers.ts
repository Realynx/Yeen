import type { FfprobeChapter, FfprobeChapterTags } from '../media-probe.adapter';

export interface MediaChapterMarker {
  second: number;
  name: string | null;
}

export function normalizeFfprobeChapterMarkers(
  chapters: readonly FfprobeChapter[] | null | undefined,
  durationSeconds: number,
): MediaChapterMarker[] {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return [];
  }

  const maxSecond =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.max(0, durationSeconds - 0.2)
      : null;
  const markers: MediaChapterMarker[] = [];

  for (const chapter of chapters) {
    const rawSecond = resolveChapterSecond(chapter);
    if (rawSecond === null || !Number.isFinite(rawSecond) || rawSecond < 0) {
      continue;
    }

    const clampedSecond =
      maxSecond === null ? rawSecond : Math.min(rawSecond, maxSecond);
    const second = Math.round(clampedSecond * 1000) / 1000;

    markers.push({
      second,
      name: resolveChapterTitle(chapter.tags),
    });
  }

  if (markers.length === 0) {
    return [];
  }

  markers.sort((left, right) => left.second - right.second);

  const deduped: MediaChapterMarker[] = [];
  let previousSecond: number | null = null;

  for (const marker of markers) {
    if (previousSecond !== null && Math.abs(marker.second - previousSecond) < 0.01) {
      continue;
    }

    deduped.push(marker);
    previousSecond = marker.second;
  }

  return deduped.map((marker, index) => ({
    second: marker.second,
    name: marker.name ?? `Chapter ${index + 1}`,
  }));
}

function resolveChapterSecond(chapter: FfprobeChapter): number | null {
  const startTime = parseNumberish(chapter.start_time);
  if (startTime !== null) {
    return startTime;
  }

  const start = parseNumberish(chapter.start);
  const timeBaseSeconds = parseTimeBaseSeconds(chapter.time_base);
  if (start !== null && timeBaseSeconds !== null) {
    return start * timeBaseSeconds;
  }

  return null;
}

function parseNumberish(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimeBaseSeconds(value: string | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  if (!cleaned.includes('/')) {
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const [numeratorRaw, denominatorRaw] = cleaned.split('/', 2);
  const numerator = Number.parseFloat(numeratorRaw);
  const denominator = Number.parseFloat(denominatorRaw);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function resolveChapterTitle(tags: FfprobeChapterTags | undefined): string | null {
  if (!tags || typeof tags !== 'object') {
    return null;
  }

  for (const [key, value] of Object.entries(tags)) {
    if (typeof value !== 'string' || key.toLowerCase() !== 'title') {
      continue;
    }

    const cleaned = value.trim();
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}
