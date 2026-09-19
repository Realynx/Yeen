import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  chmod,
  chown,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const ADDON_ID = 'com.yeen.downloader';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Add-on deployment path escaped its managed root.');
  }
}

export function validateDeploymentMetadata(value) {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    value.id !== ADDON_ID ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.version) ||
    typeof value.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    typeof value.keyId !== 'string' ||
    !/^ed25519:[a-f0-9]{32}$/.test(value.keyId) ||
    typeof value.publicKey !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.publicKey)
  ) {
    throw new Error('Bundled Downloader Add-on metadata is invalid.');
  }
  return value;
}

function parseTrustedKeysValue(value) {
  const trimmed = value.trim();
  const decoded = trimmed.startsWith('"')
    ? JSON.parse(trimmed)
    : trimmed;
  const parsed = JSON.parse(decoded || '{}');
  if (!isObject(parsed)) throw new Error('Trusted add-on keys must be a JSON object.');
  return parsed;
}

export function mergeTrustedKeyEnvironment(source, metadata) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const prefix = 'YEEN_ADDON_TRUSTED_KEYS=';
  const indexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith(prefix)) indexes.push(index);
  }
  if (indexes.length > 1) {
    throw new Error('Production environment contains duplicate trusted-key settings.');
  }
  const trusted = indexes.length === 1
    ? parseTrustedKeysValue(lines[indexes[0]].slice(prefix.length))
    : {};
  if (trusted[metadata.keyId] && trusted[metadata.keyId] !== metadata.publicKey) {
    throw new Error(`Trusted add-on key ${metadata.keyId} has conflicting material.`);
  }
  trusted[metadata.keyId] = metadata.publicKey;
  const assignment = `${prefix}${JSON.stringify(JSON.stringify(trusted))}`;
  if (indexes.length === 1) lines[indexes[0]] = assignment;
  else {
    if (lines.at(-1) !== '') lines.push('');
    lines.splice(lines.length - 1, 0, assignment);
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

async function updateEnvironment(envPath, metadata) {
  const envStat = await stat(envPath);
  const source = await readFile(envPath, 'utf8');
  const updated = mergeTrustedKeyEnvironment(source, metadata);
  if (updated === source) return;
  const temporaryPath = `${envPath}.addon-${process.pid}.tmp`;
  await writeFile(temporaryPath, updated, {
    encoding: 'utf8',
    mode: envStat.mode & 0o777,
    flag: 'wx',
  });
  await chmod(temporaryPath, envStat.mode & 0o777);
  await chown(temporaryPath, envStat.uid, envStat.gid);
  await rename(temporaryPath, envPath);
}

function createVerifier(releaseRoot, metadata) {
  const releaseRequire = createRequire(path.join(releaseRoot, 'package.json'));
  const { AddonSignatureVerifier } = releaseRequire(
    path.join(
      releaseRoot,
      'apps/server/dist/domains/addons/application/services/addon-signature-verifier.service.js',
    ),
  );
  const { AddonPackageVerifier } = releaseRequire(
    path.join(
      releaseRoot,
      'apps/server/dist/domains/addons/application/services/addon-package-verifier.service.js',
    ),
  );
  const releaseManifest = releaseRequire(path.join(releaseRoot, 'package.json'));
  const config = {
    get(key) {
      if (key === 'YEEN_ADDON_TRUSTED_KEYS') {
        return JSON.stringify({ [metadata.keyId]: metadata.publicKey });
      }
      if (key === 'YEEN_CORE_VERSION') return releaseManifest.version;
      return undefined;
    },
  };
  return new AddonPackageVerifier(
    new AddonSignatureVerifier(config),
    config,
  );
}

async function storePackage(addonsRoot, verified) {
  const stagingRoot = path.join(addonsRoot, '.staging');
  const stagingPath = path.join(stagingRoot, `deploy-${randomUUID()}`);
  const relativeDirectory = path.posix.join(
    'packages',
    verified.manifest.id,
    `${verified.manifest.version}-${verified.digest}`,
  );
  const destination = path.resolve(
    addonsRoot,
    ...relativeDirectory.split('/'),
  );
  assertInside(addonsRoot, destination);
  await mkdir(stagingPath, { recursive: true, mode: 0o700 });
  try {
    for (const entry of verified.entries) {
      const entryPath = entry.directory
        ? entry.path.slice(0, -1)
        : entry.path;
      const outputPath = path.resolve(stagingPath, ...entryPath.split('/'));
      assertInside(stagingPath, outputPath);
      if (entry.directory) {
        await mkdir(outputPath, { recursive: true, mode: 0o700 });
        continue;
      }
      await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
      await writeFile(outputPath, entry.read(), { mode: 0o600, flag: 'wx' });
    }
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    try {
      await rename(stagingPath, destination);
    } catch (error) {
      if (!isObject(error) || !['EEXIST', 'ENOTEMPTY'].includes(error.code)) {
        throw error;
      }
    }
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }
  return relativeDirectory;
}

async function readRegistry(registryPath) {
  try {
    const parsed = JSON.parse(await readFile(registryPath, 'utf8'));
    if (parsed?.schemaVersion !== 1 || !isObject(parsed.addons)) {
      throw new Error('Add-on registry has an unsupported format.');
    }
    return parsed;
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') {
      return {
        schemaVersion: 1,
        allowUnsigned: false,
        restartRequired: false,
        addons: {},
      };
    }
    throw error;
  }
}

async function writeRegistry(registryPath, registry) {
  const temporaryPath = `${registryPath}.deploy-${process.pid}.tmp`;
  await mkdir(path.dirname(registryPath), { recursive: true, mode: 0o750 });
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, registryPath);
}

export async function stageBundledAddon({
  releaseRoot,
  archivePath,
  metadataPath,
  addonsRoot,
  envPath,
}) {
  const metadata = validateDeploymentMetadata(
    JSON.parse(await readFile(metadataPath, 'utf8')),
  );
  const archive = await readFile(archivePath);
  const digest = createHash('sha256').update(archive).digest('hex');
  if (digest !== metadata.digest) {
    throw new Error('Bundled Downloader Add-on checksum does not match metadata.');
  }
  const verified = createVerifier(releaseRoot, metadata).verify(archive);
  if (
    verified.manifest.id !== metadata.id ||
    verified.manifest.name !== metadata.name ||
    verified.manifest.version !== metadata.version ||
    verified.digest !== metadata.digest ||
    verified.trust !== 'signed' ||
    verified.signingKeyId !== metadata.keyId
  ) {
    throw new Error('Verified Downloader Add-on identity does not match deployment metadata.');
  }

  const relativeDirectory = await storePackage(addonsRoot, verified);
  const registryPath = path.join(addonsRoot, 'registry.json');
  const registry = await readRegistry(registryPath);
  const existing = registry.addons[metadata.id];
  const packageInfo = {
    version: metadata.version,
    digest: metadata.digest,
    relativeDirectory,
    installedAt: new Date().toISOString(),
    trust: 'signed',
    signingKeyId: metadata.keyId,
    serverEntrypoint: verified.manifest.entrypoints.server ?? null,
    webEntrypoint: verified.manifest.entrypoints.web ?? null,
  };
  const record = existing
    ? structuredClone(existing)
    : {
        id: metadata.id,
        name: metadata.name,
        enabled: true,
        active: null,
        pending: null,
        previous: null,
      };
  record.name = metadata.name;
  record.enabled = true;
  if (record.active?.digest === metadata.digest) {
    record.pending = null;
  } else {
    record.pending = packageInfo;
    registry.restartRequired = true;
  }
  registry.addons[metadata.id] = record;
  await writeRegistry(registryPath, registry);
  await updateEnvironment(envPath, metadata);
  return metadata;
}

export async function verifyBundledAddon({ metadataPath, addonsRoot }) {
  const metadata = validateDeploymentMetadata(
    JSON.parse(await readFile(metadataPath, 'utf8')),
  );
  const registry = await readRegistry(path.join(addonsRoot, 'registry.json'));
  const record = registry.addons[metadata.id];
  if (
    !record?.enabled ||
    record.pending !== null ||
    record.active?.version !== metadata.version ||
    record.active?.digest !== metadata.digest ||
    record.active?.trust !== 'signed' ||
    record.active?.signingKeyId !== metadata.keyId ||
    registry.restartRequired !== false
  ) {
    throw new Error('Production Downloader Add-on is not synchronized with Core deployment.');
  }
  const packageRoot = path.resolve(addonsRoot, record.active.relativeDirectory);
  assertInside(addonsRoot, packageRoot);
  const packageStat = await lstat(packageRoot);
  if (!packageStat.isDirectory() || packageStat.isSymbolicLink()) {
    throw new Error('Active Downloader Add-on package directory is invalid.');
  }
  return metadata;
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'stage' && args.length === 5) {
    const metadata = await stageBundledAddon({
      releaseRoot: path.resolve(args[0]),
      archivePath: path.resolve(args[1]),
      metadataPath: path.resolve(args[2]),
      addonsRoot: path.resolve(args[3]),
      envPath: path.resolve(args[4]),
    });
    console.log(`staged ${metadata.id}@${metadata.version} (${metadata.digest})`);
    return;
  }
  if (action === 'verify' && args.length === 2) {
    const metadata = await verifyBundledAddon({
      metadataPath: path.resolve(args[0]),
      addonsRoot: path.resolve(args[1]),
    });
    console.log(`verified ${metadata.id}@${metadata.version} (${metadata.digest})`);
    return;
  }
  throw new Error(
    'Usage: addon-deploy.mjs <stage RELEASE ARCHIVE METADATA ADDONS ENV|verify METADATA ADDONS>',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
