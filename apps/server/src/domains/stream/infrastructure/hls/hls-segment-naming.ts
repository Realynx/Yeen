/**
 * Pure helpers for HLS segment naming and timing.
 *
 * Kept dependency-free so they can be shared between the manifest writer and
 * the per-segment transcoder without either of them taking a dep on the other.
 */

const SEGMENT_FILENAME_PATTERN = /^segment_(\d{5})\.ts$/;

export interface SegmentTiming {
  startSeconds: number;
  durationSeconds: number;
}

export function segmentFileName(index: number): string {
  return `segment_${index.toString().padStart(5, '0')}.ts`;
}

export function parseSegmentIndex(fileName: string): number | null {
  const match = SEGMENT_FILENAME_PATTERN.exec(fileName);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function totalSegmentCount(
  totalDurationSeconds: number,
  segmentSeconds: number,
): number {
  return Math.max(1, Math.ceil(totalDurationSeconds / segmentSeconds));
}

export function computeSegmentTiming(
  index: number,
  segmentSeconds: number,
  totalDurationSeconds: number,
  totalSegments: number,
): SegmentTiming {
  const startSeconds = index * segmentSeconds;
  const isLast = index === totalSegments - 1;
  const durationSeconds = isLast
    ? Math.max(0.1, totalDurationSeconds - startSeconds)
    : segmentSeconds;
  return { startSeconds, durationSeconds };
}
