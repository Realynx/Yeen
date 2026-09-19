import { Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveActualFilePathValue,
  SourceUnreachableError,
} from './media-file-resolver.helper';

describe('resolveActualFilePathValue', () => {
  let scratchDir: string;
  const logger = { debug: jest.fn(), warn: jest.fn() } as unknown as Logger;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-source-resolver-'));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('rejects when both the canonical and partial source paths are missing', async () => {
    const canonicalPath = join(scratchDir, 'deleted.mkv');

    await expect(
      resolveActualFilePathValue(canonicalPath, 100, logger),
    ).rejects.toBeInstanceOf(SourceUnreachableError);
  });

  it('uses the partial source path while progressive media is still downloading', async () => {
    const canonicalPath = join(scratchDir, 'movie.mkv');
    await writeFile(`${canonicalPath}.!qB`, Buffer.alloc(32, 1));

    await expect(
      resolveActualFilePathValue(canonicalPath, 100, logger),
    ).resolves.toBe(`${canonicalPath}.!qB`);
  });
});
