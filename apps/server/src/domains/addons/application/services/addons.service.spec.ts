import { ConfigService } from '@nestjs/config';
import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { AddonPackageStorage } from '../../infrastructure/addon-package-storage';
import { AddonRegistryStore } from '../../infrastructure/addon-registry.store';
import { AddonPackageVerifier } from './addon-package-verifier.service';
import { AddonSignatureVerifier } from './addon-signature-verifier.service';
import { AddonsService } from './addons.service';

interface ZipInputEntry {
  path: string;
  data: Buffer;
  mode?: number;
}

describe('AddonsService', () => {
  let root: string;
  let privateKey: KeyObject;
  let publicKeyPem: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yeen-addons-test-'));
    const keyPair = generateKeyPairSync('ed25519');
    privateKey = keyPair.privateKey;
    publicKeyPem = keyPair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stages a valid signed package and promotes it on restart', async () => {
    const { service, registry } = createServices(root, publicKeyPem);
    await registry.onModuleInit();

    const result = await service.install({
      buffer: createAddonZip(privateKey, '1.0.0'),
      originalname: 'downloader.zip',
    });

    expect(result.restartRequired).toBe(true);
    expect(result.addon.pending?.trust).toBe('signed');
    expect(result.addon.pending?.signingKeyId).toBe('owner');
    expect(result.addon.active).toBeNull();
    const installedPath = join(
      root,
      result.addon.pending!.relativeDirectory,
      'server',
      'index.js',
    );
    expect(await readFile(installedPath, 'utf8')).toContain('downloader');

    await registry.promotePendingPackages();
    const [active] = (await service.list()).items;
    expect(active.active?.version).toBe('1.0.0');
    expect(active.pending).toBeNull();
  });

  it('requires explicit acknowledgement before accepting unsigned packages', async () => {
    const { service, registry } = createServices(root, publicKeyPem);
    await registry.onModuleInit();
    const unsigned = createAddonZip(null, '1.0.0');

    await expect(
      service.install({ buffer: unsigned, originalname: 'unsigned.zip' }),
    ).rejects.toThrow('Unsigned add-on packages are disabled');
    await expect(
      service.updateTrustPolicy({ allowUnsigned: true }),
    ).rejects.toThrow('explicit risk acknowledgement');

    await service.updateTrustPolicy({
      allowUnsigned: true,
      acknowledgeRisk: true,
    });
    const installed = await service.install({
      buffer: unsigned,
      originalname: 'unsigned.zip',
    });
    expect(installed.addon.pending?.trust).toBe('unsigned');
    expect(installed.addon.pending?.signingKeyId).toBeNull();
  });

  it('never treats an invalid signature as an unsigned package', async () => {
    const { service, registry } = createServices(root, publicKeyPem);
    await registry.onModuleInit();
    await service.updateTrustPolicy({
      allowUnsigned: true,
      acknowledgeRisk: true,
    });
    const otherKey = generateKeyPairSync('ed25519').privateKey;

    await expect(
      service.install({
        buffer: createAddonZip(otherKey, '1.0.0'),
        originalname: 'tampered.zip',
      }),
    ).rejects.toThrow('signature is invalid');
  });

  it('rejects traversal paths before extracting files', async () => {
    const { service, registry } = createServices(root, publicKeyPem);
    await registry.onModuleInit();
    const archive = createZip([
      { path: '../escape.js', data: Buffer.from('bad') },
      { path: 'yeen-addon.json', data: Buffer.from('{}') },
    ]);

    await expect(
      service.install({ buffer: archive, originalname: 'unsafe.zip' }),
    ).rejects.toThrow('unsafe path');
  });

  it('retains the previous package when a staged update is promoted', async () => {
    const { service, registry } = createServices(root, publicKeyPem);
    await registry.onModuleInit();
    await service.install({
      buffer: createAddonZip(privateKey, '1.0.0'),
      originalname: 'v1.zip',
    });
    await registry.promotePendingPackages();
    await service.install({
      buffer: createAddonZip(privateKey, '2.0.0'),
      originalname: 'v2.zip',
    });
    await registry.promotePendingPackages();

    const [record] = (await service.list()).items;
    expect(record.active?.version).toBe('2.0.0');
    expect(record.previous?.version).toBe('1.0.0');
  });
});

function createServices(rootPath: string, publicKey: string) {
  const config = new ConfigService({
    YEEN_ADDONS_ROOT: rootPath,
    YEEN_ADDON_TRUSTED_KEYS: JSON.stringify({ owner: publicKey }),
  });
  const registry = new AddonRegistryStore(config);
  const signatures = new AddonSignatureVerifier(config);
  const verifier = new AddonPackageVerifier(signatures, config);
  const storage = new AddonPackageStorage(registry);
  return {
    registry,
    service: new AddonsService(registry, verifier, storage),
  };
}

function createAddonZip(signingKey: KeyObject | null, version: string): Buffer {
  const payload = Buffer.from(
    `module.exports = { name: 'downloader', version: '${version}' };\n`,
  );
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      id: 'com.example.catalog',
      name: 'Downloader Add-on',
      version,
      addonApiVersion: 1,
      core: { minimumVersion: '1.0.0', maximumVersionExclusive: '2.0.0' },
      entrypoints: { server: 'server/index.js' },
    }),
  );
  const entries: ZipInputEntry[] = [
    { path: 'yeen-addon.json', data: manifest },
    { path: 'server/index.js', data: payload },
  ];
  const integrity = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      algorithm: 'sha256',
      files: entries
        .map((entry) => ({
          path: entry.path,
          size: entry.data.length,
          sha256: createHash('sha256').update(entry.data).digest('hex'),
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    })}\n`,
  );
  entries.push({ path: 'integrity.json', data: integrity });
  if (signingKey) {
    entries.push({
      path: 'signature.json',
      data: Buffer.from(
        JSON.stringify({
          algorithm: 'Ed25519',
          schemaVersion: 1,
          keyId: 'owner',
          signed: 'integrity.json',
          signature: sign(null, integrity, signingKey).toString('base64'),
        }),
      ),
    });
  }
  return createZip(entries);
}

function createZip(entries: ZipInputEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const checksum = crc32(entry.data);
    const compressed = deflateRawSync(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
