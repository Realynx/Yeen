export const HLS_TRANSCODE_BUFFER_TARGET_SECONDS = 30;

export function computePrefetchSegmentIndicesValue(
  currentSegmentIndex: number,
  segmentSeconds: number,
  totalSegments: number,
  targetBufferSeconds = HLS_TRANSCODE_BUFFER_TARGET_SECONDS,
): number[] {
  if (
    currentSegmentIndex < 0 ||
    segmentSeconds <= 0 ||
    totalSegments <= 0 ||
    targetBufferSeconds <= 0
  ) {
    return [];
  }

  const segmentsInWindow = Math.max(
    1,
    Math.ceil(targetBufferSeconds / segmentSeconds),
  );
  const exclusiveEnd = Math.min(
    totalSegments,
    currentSegmentIndex + segmentsInWindow,
  );
  const indices: number[] = [];

  for (
    let segmentIndex = currentSegmentIndex + 1;
    segmentIndex < exclusiveEnd;
    segmentIndex += 1
  ) {
    indices.push(segmentIndex);
  }

  return indices;
}
