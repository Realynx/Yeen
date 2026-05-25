import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

interface CleanupOrphanSessionDirsOptions {
  hlsRoot: string;
  knownSessionIds: Set<string>;
  logger: Logger;
}

export async function cleanupOrphanSessionDirsValue({
  hlsRoot,
  knownSessionIds,
  logger,
}: CleanupOrphanSessionDirsOptions): Promise<void> {
  if (!existsSync(hlsRoot)) {
    return;
  }

  try {
    const entries = await readdir(hlsRoot, { withFileTypes: true });

    await Promise.all(
      entries
        .filter(
          (entry) => entry.isDirectory() && !knownSessionIds.has(entry.name),
        )
        .map(async (entry) => {
          const dirPath = join(hlsRoot, entry.name);
          try {
            await rm(dirPath, { recursive: true, force: true });
          } catch (error) {
            logger.warn(
              `Failed to remove orphan HLS session dir ${entry.name}: ${(error as Error).message}`,
            );
          }
        }),
    );
  } catch (error) {
    logger.warn(`HLS orphan cleanup failed: ${(error as Error).message}`);
  }
}
