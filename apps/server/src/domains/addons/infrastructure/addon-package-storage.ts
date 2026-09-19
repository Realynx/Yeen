import { Injectable } from '@nestjs/common';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddonZipEntry } from './zip/addon-zip-reader';
import { AddonRegistryStore } from './addon-registry.store';

@Injectable()
export class AddonPackageStorage {
  constructor(private readonly registry: AddonRegistryStore) {}

  async store(input: {
    id: string;
    version: string;
    digest: string;
    entries: AddonZipEntry[];
  }): Promise<string> {
    const root = this.registry.getRootPath();
    const stagingRoot = join(root, '.staging');
    const stagingPath = join(stagingRoot, randomUUID());
    const relativeDirectory = join(
      'packages',
      input.id,
      `${input.version}-${input.digest}`,
    );
    const destination = resolve(root, relativeDirectory);
    assertInside(root, destination);

    await mkdir(stagingPath, { recursive: true });
    try {
      for (const entry of input.entries) {
        const outputPath = resolve(stagingPath, ...entry.path.split('/'));
        assertInside(stagingPath, outputPath);
        if (entry.directory) {
          await mkdir(outputPath, { recursive: true });
          continue;
        }
        await mkdir(resolve(outputPath, '..'), { recursive: true });
        await writeFile(outputPath, entry.read(), { mode: 0o600, flag: 'wx' });
      }
      await mkdir(resolve(destination, '..'), { recursive: true });
      try {
        await rename(stagingPath, destination);
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
      return relative(root, destination).replaceAll('\\', '/');
    } finally {
      await rm(stagingPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}

function assertInside(root: string, candidate: string): void {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  if (
    pathFromRoot.startsWith('..') ||
    pathFromRoot.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error('Resolved add-on storage path escaped its root.');
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EEXIST' || error.code === 'ENOTEMPTY')
  );
}
