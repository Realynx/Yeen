import { execFile } from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AddonRegistryState,
  InstalledAddonPackage,
} from '../domain/addon-package.types';
import {
  bootstrapAddonHost,
  initializeAddonHostDependencyPath,
  quarantineAddonHostModules,
} from './addon-host.bootstrap';

const execFileAsync = promisify(execFile);

describe('bootstrapAddonHost', () => {
  let root: string;
  let originalRoot: string | undefined;
  let originalTrustedKeys: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yeen-addon-host-test-'));
    originalRoot = process.env.YEEN_ADDONS_ROOT;
    originalTrustedKeys = process.env.YEEN_ADDON_TRUSTED_KEYS;
    process.env.YEEN_ADDONS_ROOT = root;
    delete process.env.YEEN_ADDON_TRUSTED_KEYS;
  });

  afterEach(async () => {
    restoreEnvironment('YEEN_ADDONS_ROOT', originalRoot);
    restoreEnvironment('YEEN_ADDON_TRUSTED_KEYS', originalTrustedKeys);
    delete (globalThis as Record<string, unknown>).__yeenAddonLoaded;
    await rm(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('revalidates, promotes, and registers a pending server add-on before Nest starts', async () => {
    const packageInfo = installedPackage('1.0.0', 'pending');
    await writePackage(
      packageInfo,
      'module.exports = { register(context) { global.__yeenAddonLoaded = context; } };\n',
    );
    await writeRegistry(registryWith(packageInfo, 'pending'));

    const result = await bootstrapAddonHost();

    expect(result).toEqual({ nestModules: [], moduleAddonIds: [] });
    expect(
      (globalThis as Record<string, unknown>).__yeenAddonLoaded,
    ).toMatchObject({
      addonId: 'com.yeen.test',
      addonVersion: '1.0.0',
    });
    const state = await readRegistry();
    expect(state.addons['com.yeen.test'].active?.digest).toBe(
      packageInfo.digest,
    );
    expect(state.addons['com.yeen.test'].pending).toBeNull();
    expect(state.restartRequired).toBe(false);
  });

  it('quarantines an active package whose extracted payload was tampered with', async () => {
    const packageInfo = installedPackage('1.0.0', 'tampered');
    const entrypoint = await writePackage(
      packageInfo,
      'module.exports = { register() { global.__yeenAddonLoaded = true; } };\n',
    );
    await writeFile(
      entrypoint,
      'module.exports = { register() { global.__yeenAddonLoaded = "tampered"; } };\n',
    );
    await writeRegistry(registryWith(packageInfo, 'active'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(bootstrapAddonHost()).resolves.toEqual({
      nestModules: [],
      moduleAddonIds: [],
    });

    const state = await readRegistry();
    expect(state.addons['com.yeen.test'].active).toBeNull();
    expect(state.addons['com.yeen.test'].quarantined?.digest).toBe(
      packageInfo.digest,
    );
    expect(state.addons['com.yeen.test'].enabled).toBe(false);
    expect(
      (globalThis as Record<string, unknown>).__yeenAddonLoaded,
    ).toBeUndefined();
  });

  it('revalidates a signed package against the currently trusted keys', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const packageInfo = installedPackage('1.0.0', 'signed', 'signed');
    process.env.YEEN_ADDON_TRUSTED_KEYS = JSON.stringify({
      owner: publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
    });
    await writePackage(
      packageInfo,
      'module.exports = { register() { global.__yeenAddonLoaded = true; } };\n',
      privateKey,
    );
    await writeRegistry(registryWith(packageInfo, 'active'));
    delete process.env.YEEN_ADDON_TRUSTED_KEYS;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await bootstrapAddonHost();

    const state = await readRegistry();
    expect(state.addons['com.yeen.test'].active).toBeNull();
    expect(state.addons['com.yeen.test'].enabled).toBe(false);
    expect(
      (globalThis as Record<string, unknown>).__yeenAddonLoaded,
    ).toBeUndefined();
  });

  it('loads the previous server package in the same boot when an update fails', async () => {
    const previous = installedPackage('1.0.0', 'previous');
    const update = installedPackage('2.0.0', 'update');
    await writePackage(
      previous,
      'module.exports = { register() { global.__yeenAddonLoaded = "previous"; } };\n',
    );
    await writePackage(update, "throw new Error('broken update');\n");
    const state = registryWith(update, 'active');
    state.addons['com.yeen.test'].previous = previous;
    await writeRegistry(state);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(bootstrapAddonHost()).resolves.toEqual({
      nestModules: [],
      moduleAddonIds: [],
    });

    const stored = await readRegistry();
    expect(stored.addons['com.yeen.test'].active?.digest).toBe(previous.digest);
    expect(stored.addons['com.yeen.test'].quarantined?.digest).toBe(
      update.digest,
    );
    expect(stored.addons['com.yeen.test'].enabled).toBe(true);
    expect((globalThis as Record<string, unknown>).__yeenAddonLoaded).toBe(
      'previous',
    );
  });

  it('disables and quarantines the previous package when fallback also fails', async () => {
    const previous = installedPackage('1.0.0', 'previous-bad');
    const update = installedPackage('2.0.0', 'update-bad');
    await writePackage(previous, "throw new Error('broken previous');\n");
    await writePackage(update, "throw new Error('broken update');\n");
    const state = registryWith(update, 'active');
    state.addons['com.yeen.test'].previous = previous;
    await writeRegistry(state);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await bootstrapAddonHost();

    const stored = await readRegistry();
    expect(stored.addons['com.yeen.test'].active).toBeNull();
    expect(stored.addons['com.yeen.test'].quarantined?.digest).toBe(
      previous.digest,
    );
    expect(stored.addons['com.yeen.test'].enabled).toBe(false);
  });

  it('returns the previous Nest module for a same-boot retry after module initialization fails', async () => {
    const previous = installedPackage('1.0.0', 'previous-module');
    const update = installedPackage('2.0.0', 'update-module');
    await writePackage(
      previous,
      'class PreviousModule {}; module.exports = { register() { return { nestModules: [PreviousModule] }; } };\n',
    );
    await writePackage(
      update,
      'class UpdateModule {}; module.exports = { register() { return { nestModules: [UpdateModule] }; } };\n',
    );
    const state = registryWith(update, 'active');
    state.addons['com.yeen.test'].previous = previous;
    await writeRegistry(state);

    const initial = await bootstrapAddonHost();
    const fallback = await quarantineAddonHostModules(initial.moduleAddonIds);

    expect(initial.nestModules.map((module) => module.name)).toEqual([
      'UpdateModule',
    ]);
    expect(fallback.nestModules.map((module) => module.name)).toEqual([
      'PreviousModule',
    ]);
    expect(fallback.moduleAddonIds).toEqual(['com.yeen.test']);
    const stored = await readRegistry();
    expect(stored.addons['com.yeen.test'].active?.digest).toBe(previous.digest);
    expect(stored.addons['com.yeen.test'].quarantined?.digest).toBe(
      update.digest,
    );
  });

  it('resolves documented host dependencies from an installed package', async () => {
    const dependencyRoot = initializeAddonHostDependencyPath();
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--preserve-symlinks',
        '--preserve-symlinks-main',
        '-e',
        "process.stdout.write(require.resolve('@nestjs/common/package.json'))",
      ],
      { cwd: root, env: { ...process.env } },
    );

    expect(stdout).toContain(dependencyRoot);
  });

  async function writePackage(
    packageInfo: InstalledAddonPackage,
    serverCode: string,
    signingKey?: KeyObject,
  ): Promise<string> {
    const packageRoot = join(root, packageInfo.relativeDirectory);
    const entrypoint = join(packageRoot, 'server', 'index.cjs');
    await mkdir(join(entrypoint, '..'), { recursive: true });
    const manifest = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        id: 'com.yeen.test',
        name: 'Test Add-on',
        version: packageInfo.version,
        addonApiVersion: 1,
        core: { minimumVersion: '1.0.0' },
        entrypoints: { server: 'server/index.cjs' },
      })}\n`,
    );
    const server = Buffer.from(serverCode);
    const payload = [
      { path: 'server/index.cjs', data: server },
      { path: 'yeen-addon.json', data: manifest },
    ];
    const integrity = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        algorithm: 'sha256',
        files: payload.map((file) => ({
          path: file.path,
          size: file.data.length,
          sha256: createHash('sha256').update(file.data).digest('hex'),
        })),
      })}\n`,
    );
    await writeFile(entrypoint, server);
    await writeFile(join(packageRoot, 'yeen-addon.json'), manifest);
    await writeFile(join(packageRoot, 'integrity.json'), integrity);
    if (signingKey) {
      await writeFile(
        join(packageRoot, 'signature.json'),
        `${JSON.stringify({
          schemaVersion: 1,
          algorithm: 'Ed25519',
          keyId: 'owner',
          signed: 'integrity.json',
          signature: sign(null, integrity, signingKey).toString('base64'),
        })}\n`,
      );
    }
    return entrypoint;
  }

  function writeRegistry(state: AddonRegistryState) {
    return writeFile(join(root, 'registry.json'), `${JSON.stringify(state)}\n`);
  }

  async function readRegistry(): Promise<AddonRegistryState> {
    return JSON.parse(
      await readFile(join(root, 'registry.json'), 'utf8'),
    ) as AddonRegistryState;
  }
});

function installedPackage(
  version: string,
  label: string,
  trust: 'signed' | 'unsigned' = 'unsigned',
): InstalledAddonPackage {
  const digest = createHash('sha256').update(label).digest('hex');
  return {
    version,
    digest,
    relativeDirectory: `packages/com.yeen.test/${version}-${digest}`,
    installedAt: new Date(0).toISOString(),
    trust,
    signingKeyId: trust === 'signed' ? 'owner' : null,
    serverEntrypoint: 'server/index.cjs',
    webEntrypoint: null,
  };
}

function registryWith(
  packageInfo: InstalledAddonPackage,
  state: 'active' | 'pending',
): AddonRegistryState {
  return {
    schemaVersion: 1,
    allowUnsigned: packageInfo.trust === 'unsigned',
    restartRequired: state === 'pending',
    addons: {
      'com.yeen.test': {
        id: 'com.yeen.test',
        name: 'Test Add-on',
        enabled: true,
        active: state === 'active' ? packageInfo : null,
        pending: state === 'pending' ? packageInfo : null,
        previous: null,
      },
    },
  };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (typeof value === 'undefined') delete process.env[name];
  else process.env[name] = value;
}
