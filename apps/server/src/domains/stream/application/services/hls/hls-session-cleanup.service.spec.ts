import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HlsSessionStore,
  type HlsSession,
} from '../../../infrastructure/stores/hls-session.store';
import { HlsSessionCleanupService } from './hls-session-cleanup.service';
import type { HlsSegmentTranscoder } from './hls-segment-transcoder.service';

function session(
  sessionId: string,
  outputDir: string,
  lastAccessedAtMs: number,
): HlsSession {
  return {
    sessionId,
    outputDir,
    lastAccessedAtMs,
    startedAt: new Date(lastAccessedAtMs).toISOString(),
  } as HlsSession;
}

describe('HlsSessionCleanupService', () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-hls-budget-'));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('evicts the least-recently-used session before a new session starts', async () => {
    const oldDir = join(scratchDir, 'old');
    const recentDir = join(scratchDir, 'recent');
    await Promise.all([mkdir(oldDir), mkdir(recentDir)]);
    await Promise.all([
      writeFile(join(oldDir, 'segment.ts'), ''),
      writeFile(join(recentDir, 'segment.ts'), ''),
    ]);
    await Promise.all([
      truncate(join(oldDir, 'segment.ts'), 900 * 1024 * 1024),
      truncate(join(recentDir, 'segment.ts'), 900 * 1024 * 1024),
    ]);
    const oldSession = session('old', oldDir, 100);
    const recentSession = session('recent', recentDir, 200);
    const deleteSession = jest.fn();
    const deleteStale = jest.fn().mockReturnValue([]);
    const store = {
      deleteStale,
      all: jest.fn().mockReturnValue([recentSession, oldSession]),
      delete: deleteSession,
    } as unknown as HlsSessionStore;
    const cancelForSession = jest.fn().mockResolvedValue(undefined);
    const service = new HlsSessionCleanupService(
      store,
      {
        cancelForSession,
      } as unknown as HlsSegmentTranscoder,
      {
        cancelForSession: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('./hls-continuous-audio-transcoder.service').HlsContinuousAudioTranscoder,
    );

    await service.prepareForSessionStart();

    expect(deleteStale).toHaveBeenCalledWith(2 * 60 * 1000);
    expect(deleteSession).toHaveBeenCalledWith('old');
    expect(cancelForSession).toHaveBeenCalledWith('old');
    await expect(stat(oldDir)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(recentDir)).resolves.toBeDefined();
  });
});
