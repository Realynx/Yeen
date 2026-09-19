import { createHash } from 'node:crypto';
import { extname, join } from 'node:path';

export function posterExtensionFromUrl(urlValue: string): string {
  try {
    const pathname = new URL(urlValue).pathname.toLowerCase();
    const extension = extname(pathname);
    if (
      extension === '.jpg' ||
      extension === '.jpeg' ||
      extension === '.png' ||
      extension === '.webp'
    ) {
      return extension;
    }
  } catch {
    // Fall through to default extension.
  }

  return '.jpg';
}

export function hashPath(filePath: string): string {
  return createHash('sha1').update(filePath.toLowerCase()).digest('hex');
}

export interface ChapterThumbnailCapturePoint {
  second: number;
  name: string | null;
}

export function pickChapterThumbnailCapturePoints(
  durationSeconds: number,
  count: number,
  seed: string,
  chapterMarkers?: readonly ChapterThumbnailCapturePoint[],
): ChapterThumbnailCapturePoint[] {
  const normalizedChapterMarkers = normalizeChapterMarkers(
    chapterMarkers,
    durationSeconds,
  );

  if (normalizedChapterMarkers.length > 0) {
    return normalizedChapterMarkers;
  }

  return pickRandomThumbnailSeconds(durationSeconds, count, seed).map(
    (second) => ({
      second,
      name: null,
    }),
  );
}

export function pickRandomThumbnailSeconds(
  durationSeconds: number,
  count: number,
  seed: string,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [5].slice(0, count);
  }

  const minSecond =
    durationSeconds < 10 ? 0.5 : Math.min(20, durationSeconds * 0.08);
  const maxSecond = Math.max(minSecond + 0.5, durationSeconds - 1.2);
  const bucketSize = (maxSecond - minSecond) / Math.max(1, count);

  if (!Number.isFinite(bucketSize) || bucketSize <= 0) {
    return [
      Math.max(0.5, Math.min(durationSeconds - 0.8, durationSeconds * 0.5)),
    ];
  }

  const random = seededRandom(seed);
  const picks: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = minSecond + bucketSize * index;
    const end = Math.min(maxSecond, start + bucketSize);
    const sample = start + random() * Math.max(0.1, end - start);
    const rounded = Math.max(minSecond, Math.min(maxSecond, sample));
    picks.push(Math.round(rounded * 1000) / 1000);
  }

  return picks.sort((left, right) => left - right);
}

function normalizeChapterMarkers(
  markers: readonly ChapterThumbnailCapturePoint[] | undefined,
  durationSeconds: number,
): ChapterThumbnailCapturePoint[] {
  if (!Array.isArray(markers) || markers.length === 0) {
    return [];
  }
  const typedMarkers: readonly ChapterThumbnailCapturePoint[] = markers;

  const maxSecond =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.max(0, durationSeconds - 0.2)
      : null;

  const normalized = typedMarkers
    .map((marker) => {
      if (
        typeof marker !== 'object' ||
        marker === null ||
        !Number.isFinite(marker.second) ||
        marker.second < 0
      ) {
        return null;
      }

      const second =
        maxSecond === null ? marker.second : Math.min(marker.second, maxSecond);
      const rounded = Math.round(second * 1000) / 1000;

      const name =
        typeof marker.name === 'string' && marker.name.trim()
          ? marker.name.trim()
          : null;

      return {
        second: rounded,
        name,
      };
    })
    .filter((marker): marker is ChapterThumbnailCapturePoint => marker !== null)
    .sort((left, right) => left.second - right.second);

  const deduped: ChapterThumbnailCapturePoint[] = [];

  for (const marker of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.second - marker.second) < 0.01) {
      continue;
    }

    deduped.push(marker);
  }

  return deduped;
}

export function buildPreviewImageCandidates(
  directory: string,
  fileBaseName: string,
  previewImageExtensions: readonly string[],
): string[] {
  const baseNames = [
    fileBaseName,
    `${fileBaseName}-poster`,
    'poster',
    'folder',
    'cover',
    'front',
  ];

  return baseNames.flatMap((baseName) =>
    previewImageExtensions.map((extension) =>
      join(directory, `${baseName}${extension}`),
    ),
  );
}

function seededRandom(seed: string): () => number {
  let state = 0;

  for (let index = 0; index < seed.length; index += 1) {
    state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  }

  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) & 0xffffffff) / 0x100000000;
  };
}
