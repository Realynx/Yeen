import type { Type } from '@nestjs/common';
import { createRequire, Module as NodeModule } from 'node:module';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import type {
  AddonRecord,
  AddonRegistryState,
  InstalledAddonPackage,
} from '../domain/addon-package.types';
import { verifyInstalledAddonFromEnvironment } from '../application/services/installed-addon-verifier.service';

export interface AddonHostBootstrapResult {
  nestModules: Type<unknown>[];
  moduleAddonIds: string[];
}

interface AddonRegistrationResult {
  nestModules?: Type<unknown>[];
}

export async function bootstrapAddonHost(): Promise<AddonHostBootstrapResult> {
  initializeAddonHostDependencyPath();
  const root = resolveAddonRoot();
  const registryPath = join(root, 'registry.json');
  const state = await readRegistry(registryPath);
  if (!state) return { nestModules: [], moduleAddonIds: [] };

  let changed = promotePending(state);
  const nestModules: Type<unknown>[] = [];
  const moduleAddonIds: string[] = [];
  for (const record of Object.values(state.addons)) {
    if (!record.enabled || !record.active?.serverEntrypoint) continue;
    try {
      const registeredModules = await loadServerAddon(
        root,
        record,
        state.allowUnsigned,
      );
      nestModules.push(...registeredModules);
      if (registeredModules.length > 0) moduleAddonIds.push(record.id);
    } catch (error) {
      console.error(
        `Add-on ${record.id}@${record.active.version} failed to load and was quarantined:`,
        error,
      );
      quarantineActive(record);
      changed = true;
      if (record.enabled && record.active?.serverEntrypoint) {
        try {
          const fallbackModules = await loadServerAddon(
            root,
            record,
            state.allowUnsigned,
          );
          nestModules.push(...fallbackModules);
          if (fallbackModules.length > 0) moduleAddonIds.push(record.id);
        } catch (fallbackError) {
          console.error(
            `Fallback add-on ${record.id}@${record.active.version} failed to load and was quarantined:`,
            fallbackError,
          );
          quarantineActive(record);
        }
      }
    }
  }
  if (changed) await writeRegistryAtomic(registryPath, state);
  return { nestModules, moduleAddonIds };
}

/**
 * Make Core Yeen's production dependencies available to installed server
 * bundles. Add-ons remain responsible for bundling every non-host dependency.
 */
export function initializeAddonHostDependencyPath(): string {
  const hostRequire = createRequire(__filename);
  const nestManifest = hostRequire.resolve('@nestjs/common/package.json');
  const hostNodeModules = dirname(dirname(dirname(nestManifest)));
  const existing = (process.env.NODE_PATH ?? '')
    .split(delimiter)
    .filter(Boolean);
  if (!existing.includes(hostNodeModules)) {
    process.env.NODE_PATH = [...existing, hostNodeModules].join(delimiter);
    (NodeModule as unknown as { _initPaths(): void })._initPaths();
  }
  return hostNodeModules;
}

export async function quarantineAddonHostModules(
  addonIds: string[],
): Promise<AddonHostBootstrapResult> {
  if (addonIds.length === 0) return { nestModules: [], moduleAddonIds: [] };
  const root = resolveAddonRoot();
  const registryPath = join(root, 'registry.json');
  const state = await readRegistry(registryPath);
  if (!state) return { nestModules: [], moduleAddonIds: [] };
  const selected = new Set(addonIds);
  const nestModules: Type<unknown>[] = [];
  const moduleAddonIds: string[] = [];
  let changed = false;
  for (const record of Object.values(state.addons)) {
    if (!selected.has(record.id) || !record.active) continue;
    quarantineActive(record);
    changed = true;
    if (!record.enabled || !record.active?.serverEntrypoint) continue;
    try {
      const fallbackModules = await loadServerAddon(
        root,
        record,
        state.allowUnsigned,
      );
      nestModules.push(...fallbackModules);
      if (fallbackModules.length > 0) moduleAddonIds.push(record.id);
    } catch (error) {
      console.error(
        `Fallback add-on ${record.id}@${record.active.version} failed to load and was quarantined:`,
        error,
      );
      quarantineActive(record);
    }
  }
  if (changed) await writeRegistryAtomic(registryPath, state);
  return { nestModules, moduleAddonIds };
}

function resolveAddonRoot(): string {
  const configuredRoot = process.env.YEEN_ADDONS_ROOT?.trim();
  return resolve(configuredRoot || join(process.cwd(), 'data', 'addons'));
}

function promotePending(state: AddonRegistryState): boolean {
  let changed = false;
  for (const record of Object.values(state.addons)) {
    if (!record.pending) continue;
    record.previous = record.active ? { ...record.active } : null;
    record.active = { ...record.pending };
    record.pending = null;
    changed = true;
  }
  if (state.restartRequired) changed = true;
  state.restartRequired = false;
  return changed;
}

async function loadServerAddon(
  root: string,
  record: AddonRecord,
  allowUnsigned: boolean,
): Promise<Type<unknown>[]> {
  const active = record.active as InstalledAddonPackage;
  await verifyInstalledAddonFromEnvironment({
    root,
    record,
    package: active,
    allowUnsigned,
  });
  const packageRoot = resolve(root, active.relativeDirectory);
  const entrypoint = resolve(
    packageRoot,
    ...(active.serverEntrypoint as string).split('/'),
  );
  assertInside(root, packageRoot);
  assertInside(packageRoot, entrypoint);
  const imported = createRequire(__filename)(entrypoint) as unknown;
  if (!isObject(imported)) {
    throw new Error('Server entrypoint must export an add-on object.');
  }
  const addon = isObject(imported.default) ? imported.default : imported;
  const register = addon.register;
  if (typeof register !== 'function') {
    throw new Error(
      'Server entrypoint must export an add-on with register(context).',
    );
  }
  const dataDirectory = join(root, 'data', record.id);
  await mkdir(dataDirectory, { recursive: true });
  const result = (await (
    register as (context: {
      addonId: string;
      addonVersion: string;
      dataDirectory: string;
    }) => unknown
  )({
    addonId: record.id,
    addonVersion: active.version,
    dataDirectory,
  })) as AddonRegistrationResult | void;
  if (!result?.nestModules) return [];
  if (
    !Array.isArray(result.nestModules) ||
    result.nestModules.some((module) => typeof module !== 'function')
  ) {
    throw new Error('Add-on register(context) returned invalid Nest modules.');
  }
  return result.nestModules;
}

function quarantineActive(record: AddonRecord): void {
  record.quarantined = record.active ? { ...record.active } : null;
  record.active = record.previous ? { ...record.previous } : null;
  record.previous = null;
  if (!record.active) record.enabled = false;
}

async function readRegistry(path: string): Promise<AddonRegistryState | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== 1 ||
      !isObject(parsed.addons)
    ) {
      throw new Error('Add-on registry has an unsupported format.');
    }
    return parsed as unknown as AddonRegistryState;
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeRegistryAtomic(
  path: string,
  state: AddonRegistryState,
): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, path);
}

function assertInside(root: string, candidate: string): void {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  if (pathFromRoot.startsWith('..') || pathFromRoot.includes('\0')) {
    throw new Error('Add-on path escaped its package directory.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
