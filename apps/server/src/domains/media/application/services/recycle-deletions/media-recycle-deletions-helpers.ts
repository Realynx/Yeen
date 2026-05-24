import { isAbsolute, parse, relative, resolve } from 'node:path';

export function collectDriveRoots(locations: readonly string[]): string[] {
  const driveRoots = new Set<string>();

  for (const location of locations) {
    const absoluteLocation = resolve(location);
    const parsedRoot = parse(absoluteLocation).root || absoluteLocation;
    driveRoots.add(resolve(parsedRoot));
  }

  return [...driveRoots].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

export function isValidRecycleOperationPath(
  operationPath: string,
  basePaths: readonly string[],
): boolean {
  const resolvedOperationPath = resolve(operationPath);

  for (const basePath of basePaths) {
    const resolvedBasePath = resolve(basePath);
    const rel = relative(resolvedBasePath, resolvedOperationPath);

    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      continue;
    }

    const depth = rel.split(/[\\/]+/).filter(Boolean).length;
    if (depth === 1) {
      return true;
    }
  }

  return false;
}

export function normalizeRecycleOperationPaths(
  paths: readonly string[] | undefined,
): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  const normalizedByKey = new Map<string, string>();
  for (const path of paths) {
    if (typeof path !== 'string') {
      continue;
    }

    const cleaned = path.trim();
    if (!cleaned) {
      continue;
    }

    const resolvedPath = resolve(cleaned);
    normalizedByKey.set(resolvedPath.toLowerCase(), resolvedPath);
  }

  return [...normalizedByKey.values()];
}

export function buildRecyclePurgeMessage(input: {
  deleted: number;
  failed: number;
  requested: number;
  reclaimedBytes: number;
}): string {
  if (input.failed === 0) {
    return `Purged ${input.deleted} recycle operation folder(s), reclaimed ${input.reclaimedBytes} bytes.`;
  }

  return `Purged ${input.deleted} of ${input.requested} recycle operation folder(s), reclaimed ${input.reclaimedBytes} bytes; ${input.failed} failed.`;
}
