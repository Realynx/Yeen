import { readdir } from 'node:fs/promises';
import { parseSegmentIndex } from '../../../infrastructure/hls/hls-segment-naming';

/**
 * Lists all ready segment indices in an HLS session output directory by parsing
 * segment filenames, sorted numerically. Returns empty array if directory
 * access fails.
 */
export async function listReadySegmentIndicesValue(
  outputDir: string,
): Promise<number[]> {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => parseSegmentIndex(entry.name))
      .filter((index): index is number => index !== null)
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

/**
 * Computes the count of contiguous ready segments starting from index 0.
 * Used to determine how far a client can safely resume playback without gaps.
 */
export function computeContiguousReadySegmentsValue(
  readySegmentIndices: number[],
  totalSegments: number,
): number {
  let contiguous = 0;
  for (const segmentIndex of readySegmentIndices) {
    if (segmentIndex !== contiguous || contiguous >= totalSegments) {
      break;
    }
    contiguous += 1;
  }
  return contiguous;
}
