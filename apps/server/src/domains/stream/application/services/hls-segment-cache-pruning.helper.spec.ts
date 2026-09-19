import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { segmentFileName } from '../../infrastructure/hls/hls-segment-naming';
import { pruneOldHlsSegmentsValue } from './hls-segment-cache-pruning.helper';

describe('pruneOldHlsSegmentsValue', () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-hls-prune-'));
    await mkdir(scratchDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  async function seedSegment(index: number): Promise<void> {
    await writeFile(join(scratchDir, segmentFileName(index)), 'segment');
  }

  it('keeps the same playback-time window for different segment durations', async () => {
    await Promise.all([20, 39, 40, 50, 81, 82, 100].map(seedSegment));

    await pruneOldHlsSegmentsValue({
      outputDir: scratchDir,
      currentSegmentIndex: 100,
      segmentSeconds: 3,
      keepBehindSeconds: 180,
    });

    expect(await readdir(scratchDir)).toEqual([
      segmentFileName(40),
      segmentFileName(50),
      segmentFileName(81),
      segmentFileName(82),
      segmentFileName(100),
    ]);

    await Promise.all([20, 39, 40, 50, 81].map(seedSegment));
    await pruneOldHlsSegmentsValue({
      outputDir: scratchDir,
      currentSegmentIndex: 100,
      segmentSeconds: 10,
      keepBehindSeconds: 180,
    });

    expect(await readdir(scratchDir)).toEqual([
      segmentFileName(82),
      segmentFileName(100),
    ]);
  });

  it('does not remove manifests, partial output, or explicitly protected segments', async () => {
    await Promise.all([1, 2, 100].map(seedSegment));
    await writeFile(join(scratchDir, 'master.m3u8'), '#EXTM3U');
    await writeFile(join(scratchDir, `${segmentFileName(3)}.part`), 'partial');

    await pruneOldHlsSegmentsValue({
      outputDir: scratchDir,
      currentSegmentIndex: 100,
      segmentSeconds: 3,
      keepBehindSeconds: 180,
      protectedSegmentIndices: new Set([2]),
    });

    expect(await readdir(scratchDir)).toEqual([
      'master.m3u8',
      segmentFileName(2),
      `${segmentFileName(3)}.part`,
      segmentFileName(100),
    ]);
  });
});
