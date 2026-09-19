import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  ADDON_INTEGRITY_FILE,
  ADDON_MANIFEST_FILE,
  ADDON_SIGNATURE_FILE,
  type AddonIntegrity,
  type AddonManifest,
} from '../../domain/addon-package.types';
import {
  readAddonZip,
  type AddonZipEntry,
} from '../../infrastructure/zip/addon-zip-reader';
import { AddonSignatureVerifier } from './addon-signature-verifier.service';

const ZIP_LIMITS = {
  maxEntries: 4_096,
  maxEntryBytes: 128 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export interface VerifiedAddonPackage {
  manifest: AddonManifest;
  entries: AddonZipEntry[];
  digest: string;
  trust: 'signed' | 'unsigned';
  signingKeyId: string | null;
}

export interface AddonPayloadEntry {
  path: string;
  directory: boolean;
  uncompressedSize: number;
  read(): Buffer;
}

export interface AddonPayloadFile {
  path: string;
  size: number;
  sha256: string;
}

@Injectable()
export class AddonPackageVerifier {
  private readonly coreVersion: string;

  constructor(
    private readonly signatures: AddonSignatureVerifier,
    configService: ConfigService,
  ) {
    this.coreVersion =
      configService.get<string>('YEEN_CORE_VERSION')?.trim() || '1.0.0';
  }

  verify(archive: Buffer): VerifiedAddonPackage {
    const entries = readAddonZip(archive, ZIP_LIMITS);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const manifestEntry = byPath.get(ADDON_MANIFEST_FILE);
    if (!manifestEntry || manifestEntry.directory) {
      throw new BadRequestException(
        `Add-on packages require ${ADDON_MANIFEST_FILE}.`,
      );
    }
    const manifestBytes = manifestEntry.read();
    const manifest = parseAddonManifest(manifestBytes);
    validateAddonCompatibility(manifest, this.coreVersion);
    const integrityEntry = byPath.get(ADDON_INTEGRITY_FILE);
    if (!integrityEntry || integrityEntry.directory) {
      throw new BadRequestException(
        `Add-on packages require ${ADDON_INTEGRITY_FILE}.`,
      );
    }
    const integrityBytes = integrityEntry.read();
    const integrity = parseAddonIntegrity(integrityBytes);
    const signatureEntry = byPath.get(ADDON_SIGNATURE_FILE);
    const trust = this.signatures.verify(
      integrityBytes,
      signatureEntry && !signatureEntry.directory
        ? signatureEntry.read()
        : undefined,
    );
    validateAddonPayload(manifest, integrity, entries);
    return {
      manifest,
      entries,
      digest: createHash('sha256').update(archive).digest('hex'),
      ...trust,
    };
  }
}

export function parseAddonManifest(bytes: Buffer): AddonManifest {
  const parsed = parseManifestJson(bytes);
  if (!isObject(parsed) || parsed.schemaVersion !== 1) invalidManifest();
  validateManifestIdentity(parsed);
  validateManifestCore(parsed);
  validateManifestEntrypoints(parsed);
  validateManifestPermissions(parsed.permissions);
  validateManifestPlatforms(parsed.platforms);
  return parsed as unknown as AddonManifest;
}

function parseManifestJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new BadRequestException('The add-on manifest is malformed.');
  }
}

function validateManifestIdentity(parsed: Record<string, unknown>): void {
  if (
    typeof parsed.id !== 'string' ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(parsed.id)
  ) {
    invalidManifest();
  }
  if (
    typeof parsed.name !== 'string' ||
    !parsed.name ||
    parsed.name.trim() !== parsed.name ||
    parsed.name.length > 120
  ) {
    invalidManifest();
  }
  if (typeof parsed.version !== 'string' || !isSemver(parsed.version)) {
    invalidManifest();
  }
  if (
    !Number.isSafeInteger(parsed.addonApiVersion) ||
    parsed.addonApiVersion !== 1
  )
    invalidManifest();
}

function validateManifestCore(parsed: Record<string, unknown>): void {
  if (
    !isObject(parsed.core) ||
    typeof parsed.core.minimumVersion !== 'string' ||
    !isSemver(parsed.core.minimumVersion)
  )
    invalidManifest();
  if (
    typeof parsed.core.maximumVersionExclusive !== 'undefined' &&
    (typeof parsed.core.maximumVersionExclusive !== 'string' ||
      !isSemver(parsed.core.maximumVersionExclusive))
  )
    invalidManifest();
}

function validateManifestEntrypoints(parsed: Record<string, unknown>): void {
  if (!isObject(parsed.entrypoints)) invalidManifest();
  const entrypoints = parsed.entrypoints;
  for (const key of Object.keys(entrypoints)) {
    if (key !== 'server' && key !== 'web') invalidManifest();
  }
  if (
    !validOptionalPath(entrypoints.server) ||
    !validOptionalPath(entrypoints.web)
  )
    invalidManifest();
  if (!entrypoints.server && !entrypoints.web) invalidManifest();
}

function validateManifestPermissions(permissions: unknown): void {
  if (
    typeof permissions !== 'undefined' &&
    (!Array.isArray(permissions) ||
      permissions.some(
        (permission) =>
          typeof permission !== 'string' ||
          !permission ||
          permission.trim() !== permission,
      ) ||
      new Set(permissions).size !== permissions.length)
  )
    invalidManifest();
}

function validateManifestPlatforms(platforms: unknown): void {
  if (
    typeof platforms !== 'undefined' &&
    (!Array.isArray(platforms) ||
      platforms.some(
        (platform) =>
          !isObject(platform) ||
          !['linux', 'darwin', 'win32'].includes(String(platform.os)) ||
          !['arm64', 'x64'].includes(String(platform.arch)),
      ))
  )
    invalidManifest();
}

export function parseAddonIntegrity(bytes: Buffer): AddonIntegrity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new BadRequestException('The add-on integrity file is malformed.');
  }
  if (
    !isObject(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.algorithm !== 'sha256' ||
    !Array.isArray(parsed.files)
  )
    invalidIntegrity();
  validateIntegrityFiles(parsed.files);
  assertCanonicalIntegrity(bytes, parsed);
  return parsed as unknown as AddonIntegrity;
}

function validateIntegrityFiles(files: unknown[]): void {
  let previousPath = '';
  const folded = new Set<string>();
  for (const candidate of files) {
    if (!isObject(candidate)) invalidIntegrity();
    const file = candidate;
    validateIntegrityFile(file, previousPath);
    const key = file.path.normalize('NFC').toLowerCase();
    if (folded.has(key)) invalidIntegrity();
    folded.add(key);
    previousPath = file.path;
  }
}

function validateIntegrityFile(
  file: Record<string, unknown>,
  previousPath: string,
): asserts file is { path: string; size: number; sha256: string } {
  const validPath =
    typeof file.path === 'string' &&
    isSafePackagePath(file.path) &&
    file.path !== ADDON_INTEGRITY_FILE &&
    file.path !== ADDON_SIGNATURE_FILE &&
    file.path > previousPath;
  const validSize = Number.isSafeInteger(file.size) && Number(file.size) >= 0;
  const validDigest =
    typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256);
  if (!validPath || !validSize || !validDigest) invalidIntegrity();
}

function assertCanonicalIntegrity(bytes: Buffer, parsed: unknown): void {
  const canonical = Buffer.from(`${JSON.stringify(parsed)}\n`, 'utf8');
  if (!canonical.equals(bytes)) {
    throw new BadRequestException(
      'The add-on integrity file is not canonically serialized.',
    );
  }
}

export function validateAddonPayload(
  manifest: AddonManifest,
  integrity: AddonIntegrity,
  entries: AddonPayloadEntry[],
): void {
  const payloadFiles = entries
    .filter(
      (entry) =>
        !entry.directory &&
        entry.path !== ADDON_INTEGRITY_FILE &&
        entry.path !== ADDON_SIGNATURE_FILE,
    )
    .map((entry) => ({
      path: entry.path,
      size: entry.uncompressedSize,
      sha256: createHash('sha256').update(entry.read()).digest('hex'),
    }));
  validateAddonPayloadFiles(manifest, integrity, payloadFiles);
}

export function validateAddonPayloadFiles(
  manifest: AddonManifest,
  integrity: AddonIntegrity,
  payloadFiles: AddonPayloadFile[],
): void {
  const expected = new Map<string, { sha256: string; size: number }>();
  for (const file of integrity.files) {
    const key = file.path.normalize('NFC').toLowerCase();
    if (expected.has(key))
      throw new BadRequestException(
        'The manifest contains duplicate file paths.',
      );
    expected.set(key, { sha256: file.sha256, size: file.size });
  }
  if (expected.size !== payloadFiles.length) {
    throw new BadRequestException(
      'The ZIP payload does not match the add-on manifest.',
    );
  }
  for (const file of payloadFiles) {
    const expectedFile = expected.get(file.path.normalize('NFC').toLowerCase());
    if (
      !expectedFile ||
      expectedFile.size !== file.size ||
      expectedFile.sha256 !== file.sha256
    ) {
      throw new BadRequestException(
        `Add-on payload integrity failed for ${file.path}.`,
      );
    }
  }
  for (const entrypoint of [
    manifest.entrypoints.server,
    manifest.entrypoints.web,
  ]) {
    if (
      entrypoint &&
      !expected.has(entrypoint.normalize('NFC').toLowerCase())
    ) {
      throw new BadRequestException(
        `Add-on entrypoint ${entrypoint} is missing from the payload.`,
      );
    }
  }
}

export function validateAddonCompatibility(
  manifest: AddonManifest,
  coreVersion: string,
): void {
  if (!isSemver(coreVersion))
    throw new Error('YEEN_CORE_VERSION must be a semantic version.');
  if (
    compareSemver(coreVersion, manifest.core.minimumVersion) < 0 ||
    (manifest.core.maximumVersionExclusive &&
      compareSemver(coreVersion, manifest.core.maximumVersionExclusive) >= 0)
  ) {
    throw new BadRequestException(
      `Add-on ${manifest.id} is not compatible with Core Yeen ${coreVersion}.`,
    );
  }
  if (
    manifest.platforms?.length &&
    !manifest.platforms.some(
      (platform) =>
        platform.os === process.platform && platform.arch === process.arch,
    )
  ) {
    throw new BadRequestException(
      `Add-on ${manifest.id} does not support this platform.`,
    );
  }
}

function validOptionalPath(value: unknown): boolean {
  return (
    typeof value === 'undefined' ||
    (typeof value === 'string' && isSafePackagePath(value))
  );
}

function isSafePackagePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 260 &&
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !/^[A-Za-z]:/.test(path) &&
    path
      .split('/')
      .every((part) => part.length > 0 && part !== '.' && part !== '..')
  );
}

function invalidManifest(): never {
  throw new BadRequestException(
    'The add-on manifest has an unsupported format.',
  );
}

function invalidIntegrity(): never {
  throw new BadRequestException(
    'The add-on integrity file has an unsupported format.',
  );
}

function isSemver(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

function compareSemver(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  const coreComparison = compareSemverCore(leftVersion.core, rightVersion.core);
  if (coreComparison !== 0) return coreComparison;
  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function compareSemverCore(
  left: [bigint, bigint, bigint],
  right: [bigint, bigint, bigint],
): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

function comparePrerelease(
  left: string[] | null,
  right: string[] | null,
): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (typeof leftIdentifier === 'undefined') return -1;
    if (typeof rightIdentifier === 'undefined') return 1;
    if (leftIdentifier === rightIdentifier) continue;
    return comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
  }
  return 0;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return BigInt(left) < BigInt(right) ? -1 : 1;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : 1;
}

function parseSemver(value: string): {
  core: [bigint, bigint, bigint];
  prerelease: string[] | null;
} {
  const withoutBuild = value.split('+', 1)[0];
  const separator = withoutBuild.indexOf('-');
  const coreText =
    separator < 0 ? withoutBuild : withoutBuild.slice(0, separator);
  const prerelease =
    separator < 0 ? null : withoutBuild.slice(separator + 1).split('.');
  const core = coreText.split('.').map(BigInt) as [bigint, bigint, bigint];
  return { core, prerelease };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
