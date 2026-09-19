import {
  createHash,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_FILE = 'yeen-addon.json';
export const INTEGRITY_FILE = 'integrity.json';
export const SIGNATURE_FILE = 'signature.json';
export const PACKAGE_SCHEMA_VERSION = 1;
export const PACKAGE_LIMITS = Object.freeze({
  compressedBytes: 256 * 1024 * 1024,
  uncompressedBytes: 512 * 1024 * 1024,
  fileBytes: 128 * 1024 * 1024,
  files: 4096,
  compressionRatio: 200,
});

const ADDON_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RESERVED_FILES = new Set([INTEGRITY_FILE, SIGNATURE_FILE]);

function comparePackagePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isSafePackagePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 260 ||
    value.includes('\0') ||
    value !== value.normalize('NFC')
  ) {
    return false;
  }
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  const segments = value.split('/');
  return segments.every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  );
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${field} must be a non-empty trimmed string.`);
  }
}

function validateManifestIdentity(manifest) {
  assertNonEmptyString(manifest.id, 'id');
  if (!ADDON_ID_PATTERN.test(manifest.id)) {
    throw new Error('id must be a lowercase reverse-domain-style identifier.');
  }
  assertNonEmptyString(manifest.name, 'name');
  if (manifest.name.length > 120) {
    throw new Error('name must not exceed 120 characters.');
  }
  assertNonEmptyString(manifest.version, 'version');
  if (!VERSION_PATTERN.test(manifest.version)) {
    throw new Error('version must be a semantic version such as 1.2.3.');
  }
}

function validateCoreCompatibility(core) {
  if (!core || typeof core !== 'object' || Array.isArray(core)) {
    throw new Error('core compatibility is required.');
  }
  assertNonEmptyString(core.minimumVersion, 'core.minimumVersion');
  if (!VERSION_PATTERN.test(core.minimumVersion)) {
    throw new Error('core.minimumVersion must be a semantic version.');
  }
  if (core.maximumVersionExclusive === undefined) return;
  assertNonEmptyString(core.maximumVersionExclusive, 'core.maximumVersionExclusive');
  if (!VERSION_PATTERN.test(core.maximumVersionExclusive)) {
    throw new Error('core.maximumVersionExclusive must be a semantic version.');
  }
}

function validateEntrypoints(entrypoints) {
  if (!entrypoints || typeof entrypoints !== 'object' || Array.isArray(entrypoints)) {
    throw new Error('entrypoints must be an object.');
  }
  const configured = [entrypoints.server, entrypoints.web]
    .filter((value) => value !== undefined);
  if (configured.length === 0) {
    throw new Error('At least one server or web entrypoint is required.');
  }
  for (const entrypoint of configured) {
    if (!isSafePackagePath(entrypoint) || RESERVED_FILES.has(entrypoint)) {
      throw new Error(`Unsafe add-on entrypoint: ${String(entrypoint)}.`);
    }
  }
}

function validatePermissions(permissions) {
  if (permissions === undefined) return;
  if (!Array.isArray(permissions)) {
    throw new Error('permissions must be an array when provided.');
  }
  for (const permission of permissions) {
    assertNonEmptyString(permission, 'permission');
  }
  if (new Set(permissions).size !== permissions.length) {
    throw new Error('permissions must not contain duplicates.');
  }
}

function validatePlatforms(platforms) {
  if (platforms === undefined) return;
  if (!Array.isArray(platforms)) {
    throw new Error('platforms must be an array when provided.');
  }
  const supportedOs = new Set(['linux', 'darwin', 'win32']);
  const supportedArch = new Set(['arm64', 'x64']);
  const uniquePlatforms = new Set();
  for (const platform of platforms) {
    if (
      !platform
      || typeof platform !== 'object'
      || !supportedOs.has(platform.os)
      || !supportedArch.has(platform.arch)
    ) {
      throw new Error('Each platform must contain a supported os and arch.');
    }
    const key = `${platform.os}/${platform.arch}`;
    if (uniquePlatforms.has(key)) throw new Error(`Duplicate platform: ${key}.`);
    uniquePlatforms.add(key);
  }
}

export function validateAddonManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${MANIFEST_FILE} must contain a JSON object.`);
  }
  if (manifest.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported add-on schemaVersion: ${String(manifest.schemaVersion)}.`);
  }
  validateManifestIdentity(manifest);
  if (manifest.addonApiVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`addonApiVersion must be ${PACKAGE_SCHEMA_VERSION}.`);
  }
  validateCoreCompatibility(manifest.core);
  validateEntrypoints(manifest.entrypoints);
  validatePermissions(manifest.permissions);
  validatePlatforms(manifest.platforms);
  return manifest;
}

export async function readAndValidateManifest(sourceDirectory) {
  const manifestPath = path.join(sourceDirectory, MANIFEST_FILE);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read ${MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  validateAddonManifest(manifest);
  for (const [kind, entrypoint] of Object.entries(manifest.entrypoints)) {
    if (entrypoint === undefined) continue;
    const entrypointPath = path.join(sourceDirectory, ...entrypoint.split('/'));
    const entrypointStat = await lstat(entrypointPath).catch(() => null);
    if (!entrypointStat?.isFile()) {
      throw new Error(`${kind} entrypoint does not exist as a regular file: ${entrypoint}.`);
    }
  }
  return manifest;
}

export async function collectPayloadFiles(sourceDirectory) {
  const files = [];
  let totalBytes = 0;

  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => comparePackagePaths(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (!isSafePackagePath(relativePath)) {
        throw new Error(`Unsafe payload path: ${relativePath}.`);
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${relativePath}.`);
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          throw new Error('node_modules is not allowed; bundle add-on dependencies before packing.');
        }
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Only regular files are allowed: ${relativePath}.`);
      }
      if (RESERVED_FILES.has(relativePath)) {
        throw new Error(`${relativePath} is generated by the packer and must not exist in the source.`);
      }
      const fileStat = await lstat(absolutePath);
      if (fileStat.size > PACKAGE_LIMITS.fileBytes) {
        throw new Error(`Payload file exceeds ${PACKAGE_LIMITS.fileBytes} bytes: ${relativePath}.`);
      }
      files.push({ absolutePath, path: relativePath, size: fileStat.size });
      totalBytes += fileStat.size;
      if (files.length > PACKAGE_LIMITS.files) {
        throw new Error(`Payload exceeds the ${PACKAGE_LIMITS.files} file limit.`);
      }
      if (totalBytes > PACKAGE_LIMITS.uncompressedBytes) {
        throw new Error(`Payload exceeds the ${PACKAGE_LIMITS.uncompressedBytes} byte limit.`);
      }
    }
  }

  await visit(sourceDirectory);
  const caseFoldedPaths = new Set();
  for (const file of files) {
    const folded = file.path.normalize('NFC').toLowerCase();
    if (caseFoldedPaths.has(folded)) {
      throw new Error(`Payload contains case-colliding paths: ${file.path}.`);
    }
    caseFoldedPaths.add(folded);
  }
  return files.sort((left, right) => comparePackagePaths(left.path, right.path));
}

export async function buildIntegrityDocument(files) {
  const integrityFiles = [];
  for (const file of files) {
    const bytes = await readFile(file.absolutePath);
    const compressedBytes = deflateRawSync(bytes, { level: 9 }).byteLength;
    const compressionRatio = bytes.byteLength / Math.max(1, compressedBytes);
    if (compressionRatio > PACKAGE_LIMITS.compressionRatio) {
      throw new Error(
        `Payload file exceeds the ${PACKAGE_LIMITS.compressionRatio}:1 compression-ratio limit: ${file.path}.`,
      );
    }
    integrityFiles.push({
      path: file.path,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    algorithm: 'sha256',
    files: integrityFiles,
  };
}

export function serializeIntegrityDocument(integrity) {
  if (
    integrity?.schemaVersion !== PACKAGE_SCHEMA_VERSION ||
    integrity?.algorithm !== 'sha256' ||
    !Array.isArray(integrity.files)
  ) {
    throw new Error('Invalid integrity document.');
  }
  let previousPath = '';
  for (const file of integrity.files) {
    if (
      !isSafePackagePath(file.path) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !SHA256_PATTERN.test(file.sha256) ||
      comparePackagePaths(file.path, previousPath) <= 0
    ) {
      throw new Error('Integrity files must be safe, unique, sorted, and hashed with SHA-256.');
    }
    previousPath = file.path;
  }
  return Buffer.from(`${JSON.stringify(integrity)}\n`, 'utf8');
}

export function deriveSigningKeyId(privateKey) {
  const publicDer = createPublicKey(privateKey).export({
    type: 'spki',
    format: 'der',
  });
  const fingerprint = createHash('sha256').update(publicDer).digest('hex');
  return `ed25519:${fingerprint.slice(0, 32)}`;
}

export function createSignatureDocument(integrityBytes, privateKey, keyId) {
  assertNonEmptyString(keyId, 'keyId');
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId)) {
    throw new Error('keyId contains unsupported characters or exceeds 128 characters.');
  }
  const signature = sign(null, integrityBytes, privateKey);
  const publicKey = createPublicKey(privateKey);
  if (!verify(null, integrityBytes, publicKey, signature)) {
    throw new Error('Generated signature failed local verification.');
  }
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    algorithm: 'Ed25519',
    keyId,
    signed: INTEGRITY_FILE,
    signature: signature.toString('base64'),
  };
}
