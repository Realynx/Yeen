import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSegmentIndex } from '../../infrastructure/hls/hls-segment-naming';

interface PruneOldHlsSegmentsOptions {
  outputDir: string;
  currentSegmentIndex: number;
  segmentSeconds: number;
  keepBehindSeconds: number;
  protectedSegmentIndices?: ReadonlySet<number>;
}

export async function pruneOldHlsSegmentsValue({
  outputDir,
  currentSegmentIndex,
  segmentSeconds,
  keepBehindSeconds,
  protectedSegmentIndices = new Set<number>(),
}: PruneOldHlsSegmentsOptions): Promise<number> {
  const safeSegmentSeconds = Math.max(segmentSeconds, 1);
  const segmentsToKeep = Math.ceil(
    Math.max(keepBehindSeconds, 0) / safeSegmentSeconds,
  );
  const earliestRetainedIndex = Math.max(
    0,
    currentSegmentIndex - segmentsToKeep,
  );
  const entries = await readdir(outputDir, { withFileTypes: true });
  const stalePaths = entries.flatMap((entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      return [];
    }

    const segmentIndex = parseSegmentIndex(entry.name);
    if (
      segmentIndex === null ||
      segmentIndex >= earliestRetainedIndex ||
      protectedSegmentIndices.has(segmentIndex)
    ) {
      return [];
    }

    return [join(outputDir, entry.name)];
  });

  await Promise.all(stalePaths.map((path) => rm(path, { force: true })));
  return stalePaths.length;
}
