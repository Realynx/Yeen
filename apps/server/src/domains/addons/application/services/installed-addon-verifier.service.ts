import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, type FileHandle } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  ADDON_INTEGRITY_FILE,
  ADDON_MANIFEST_FILE,
  ADDON_SIGNATURE_FILE,
  type AddonRecord,
  type InstalledAddonPackage,
} from '../../domain/addon-package.types';
import {
  parseAddonIntegrity,
  parseAddonManifest,
  validateAddonCompatibility,
  validateAddonPayloadFiles,
  type AddonPayloadFile,
} from './addon-package-verifier.service';
import {
  AddonSignatureVerifier,
  parseTrustedKeys,
  verifyAddonSignature,
} from './addon-signature-verifier.service';

const MAX_FILES = 4_096;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_INTEGRITY_BYTES = 8 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 64 * 1024;

export interface InstalledAddonVerificationOptions {
  root: string;
  record: AddonRecord;
  package: InstalledAddonPackage;
  allowUnsigned: boolean;
  coreVersion: string;
}

@Injectable()
export class InstalledAddonVerifier {
  private readonly coreVersion: string;

  constructor(
    private readonly signatures: AddonSignatureVerifier,
    configService: ConfigService,
  ) {
    this.coreVersion =
      configService.get<string>('YEEN_CORE_VERSION')?.trim() || '1.0.0';
  }

  verify(
    root: string,
    record: AddonRecord,
    packageInfo: InstalledAddonPackage,
    allowUnsigned: boolean,
  ): Promise<void> {
    return verifyInstalledAddon(
      {
        root,
        record,
        package: packageInfo,
        allowUnsigned,
        coreVersion: this.coreVersion,
      },
      (integrityBytes, signatureBytes) =>
        this.signatures.verify(integrityBytes, signatureBytes),
    );
  }
}

export async function verifyInstalledAddon(
  options: InstalledAddonVerificationOptions,
  signatureVerifier: (
    integrityBytes: Buffer,
    signatureBytes: Buffer | undefined,
  ) => { trust: 'signed' | 'unsigned'; signingKeyId: string | null },
): Promise<void> {
  const { record, package: packageInfo } = options;
  assertPackageLocation(options.root, record.id, packageInfo);
  const packageRoot = resolve(options.root, packageInfo.relativeDirectory);
  const files = await inventoryPackage(packageRoot);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifestFile = requireFile(byPath, ADDON_MANIFEST_FILE);
  const integrityFile = requireFile(byPath, ADDON_INTEGRITY_FILE);
  const signatureFile = byPath.get(ADDON_SIGNATURE_FILE);
  const manifestBytes = await readBounded(manifestFile, MAX_MANIFEST_BYTES);
  const integrityBytes = await readBounded(integrityFile, MAX_INTEGRITY_BYTES);
  const signatureBytes = signatureFile
    ? await readBounded(signatureFile, MAX_SIGNATURE_BYTES)
    : undefined;
  const manifest = parseAddonManifest(manifestBytes);
  const integrity = parseAddonIntegrity(integrityBytes);
  validateAddonCompatibility(manifest, options.coreVersion);
  assertManifestIdentity(record, packageInfo, manifest);
  const trust = signatureVerifier(integrityBytes, signatureBytes);
  if (trust.trust === 'unsigned' && !options.allowUnsigned) {
    throw new BadRequestException(
      'Unsigned add-on packages are disabled by the current trust policy.',
    );
  }
  if (
    trust.trust !== packageInfo.trust ||
    trust.signingKeyId !== packageInfo.signingKeyId
  ) {
    throw new BadRequestException(
      'The installed add-on trust identity no longer matches its registry record.',
    );
  }
  const payloadFiles: AddonPayloadFile[] = [];
  for (const file of files) {
    if (
      file.path === ADDON_INTEGRITY_FILE ||
      file.path === ADDON_SIGNATURE_FILE
    ) {
      continue;
    }
    payloadFiles.push({
      path: file.path,
      size: file.size,
      sha256: await hashFile(file),
    });
  }
  validateAddonPayloadFiles(manifest, integrity, payloadFiles);
}

export function verifyInstalledAddonFromEnvironment(input: {
  root: string;
  record: AddonRecord;
  package: InstalledAddonPackage;
  allowUnsigned: boolean;
}): Promise<void> {
  const trustedKeys = parseTrustedKeys(process.env.YEEN_ADDON_TRUSTED_KEYS);
  return verifyInstalledAddon(
    {
      ...input,
      coreVersion: process.env.YEEN_CORE_VERSION?.trim() || '1.0.0',
    },
    (integrityBytes, signatureBytes) =>
      verifyAddonSignature(integrityBytes, signatureBytes, trustedKeys),
  );
}

interface InstalledFile {
  path: string;
  absolutePath: string;
  size: number;
}

async function inventoryPackage(packageRoot: string): Promise<InstalledFile[]> {
  const rootStat = await lstat(packageRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) invalidFilesystem();
  const files: InstalledFile[] = [];
  let totalBytes = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const fileStat = await lstat(absolutePath);
      if (fileStat.isSymbolicLink()) invalidFilesystem();
      if (fileStat.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!fileStat.isFile()) invalidFilesystem();
      const path = relative(packageRoot, absolutePath).replaceAll('\\', '/');
      files.push({ path, absolutePath, size: fileStat.size });
      totalBytes += fileStat.size;
      if (files.length > MAX_FILES || totalBytes > MAX_EXPANDED_BYTES) {
        throw new BadRequestException(
          'The installed add-on exceeds package safety limits.',
        );
      }
    }
  };
  await visit(packageRoot);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function requireFile(
  files: Map<string, InstalledFile>,
  path: string,
): InstalledFile {
  const file = files.get(path);
  if (!file) {
    throw new BadRequestException(`Installed add-on is missing ${path}.`);
  }
  return file;
}

async function readBounded(
  file: InstalledFile,
  maximumBytes: number,
): Promise<Buffer> {
  if (file.size > maximumBytes) {
    throw new BadRequestException(
      `Installed add-on metadata ${file.path} exceeds its safety limit.`,
    );
  }
  const handle = await openVerifiedFile(file);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function hashFile(file: InstalledFile): Promise<string> {
  const handle = await openVerifiedFile(file);
  try {
    const bytes = await handle.readFile();
    if (bytes.length !== file.size) invalidFilesystem();
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    await handle.close();
  }
}

async function openVerifiedFile(file: InstalledFile): Promise<FileHandle> {
  const handle = await open(file.absolutePath, 'r');
  const current = await handle.stat();
  if (!current.isFile() || current.size !== file.size) {
    await handle.close();
    invalidFilesystem();
  }
  return handle;
}

function assertPackageLocation(
  root: string,
  addonId: string,
  packageInfo: InstalledAddonPackage,
): void {
  const expected = `packages/${addonId}/${packageInfo.version}-${packageInfo.digest}`;
  if (
    packageInfo.relativeDirectory !== expected ||
    !/^[a-f0-9]{64}$/.test(packageInfo.digest)
  ) {
    throw new BadRequestException(
      'The installed add-on package location does not match its registry identity.',
    );
  }
  const resolved = resolve(root, packageInfo.relativeDirectory);
  const pathFromRoot = relative(resolve(root), resolved);
  if (pathFromRoot.startsWith('..') || pathFromRoot.includes('\0')) {
    throw new BadRequestException(
      'The installed add-on package escaped the add-on storage root.',
    );
  }
}

function assertManifestIdentity(
  record: AddonRecord,
  packageInfo: InstalledAddonPackage,
  manifest: ReturnType<typeof parseAddonManifest>,
): void {
  if (
    manifest.id !== record.id ||
    manifest.version !== packageInfo.version ||
    (manifest.entrypoints.server ?? null) !== packageInfo.serverEntrypoint ||
    (manifest.entrypoints.web ?? null) !== packageInfo.webEntrypoint
  ) {
    throw new BadRequestException(
      'The installed add-on manifest does not match its registry identity.',
    );
  }
}

function invalidFilesystem(): never {
  throw new BadRequestException(
    'The installed add-on package contains an unsafe or changing filesystem entry.',
  );
}
