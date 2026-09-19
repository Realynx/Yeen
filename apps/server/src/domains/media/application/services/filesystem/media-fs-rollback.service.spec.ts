import { link, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MediaCommitStore } from '../../../infrastructure/stores/media-commit.store';
import type { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaFsFileOpsService } from './media-fs-file-ops.service';
import { MediaFsRollbackService } from './media-fs-rollback.service';

describe('MediaFsRollbackService hard-link preservation', () => {
  let testRoot = '';

  afterEach(async () => {
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
    testRoot = '';
  });

  it('rolls back by unlinking the committed path when the original is the same hard-linked file', async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'yeen-rollback-link-'));
    const originalPath = join(testRoot, 'torrent', 'movie.mkv');
    const committedPath = join(testRoot, 'library', 'Movie', 'Movie.mkv');
    await mkdir(dirname(originalPath), { recursive: true });
    await mkdir(dirname(committedPath), { recursive: true });
    await writeFile(originalPath, 'payload');
    await link(originalPath, committedPath);

    const markRolledBack = jest.fn().mockResolvedValue(undefined);
    const commitStore = {
      findById: jest.fn().mockResolvedValue({
        id: 'commit-1',
        createdAt: new Date().toISOString(),
        rolledBackAt: null,
        summary: {
          totalItems: 1,
          filesRenamed: 1,
          sidecarsMoved: 0,
          nfoFilesWritten: 0,
          directoriesCreated: 0,
          errors: 0,
        },
        operations: [
          {
            type: 'rename',
            mediaId: 'media-1',
            from: originalPath,
            to: committedPath,
            role: 'main',
          },
        ],
      }),
      markRolledBack,
    } as unknown as MediaCommitStore;
    const service = new MediaFsRollbackService(
      {} as MediaStore,
      commitStore,
      new MediaFsFileOpsService(),
    );

    await expect(service.rollback('commit-1')).resolves.toMatchObject({
      reverted: 1,
      errors: [],
    });
    await expect(stat(originalPath)).resolves.toBeDefined();
    await expect(stat(committedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(markRolledBack).toHaveBeenCalledWith(
      'commit-1',
      expect.any(String),
      [],
    );
  });
});
