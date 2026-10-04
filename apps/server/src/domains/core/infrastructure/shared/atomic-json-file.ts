import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Replace a JSON document only after its complete contents are flushed. */
export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
