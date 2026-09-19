import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  mergeTrustedKeyEnvironment,
  validateDeploymentMetadata,
  verifyBundledAddon,
} from '../addon-deploy.mjs';

const metadata = {
  schemaVersion: 1,
  id: 'com.yeen.downloader',
  name: 'Downloader Add-on',
  version: '0.3.1',
  digest: 'a'.repeat(64),
  keyId: `ed25519:${'b'.repeat(32)}`,
  publicKey: Buffer.from('publisher-key').toString('base64'),
};

test('trusted publisher merge preserves existing keys and is idempotent', () => {
  const source = [
    'PORT=8080',
    `YEEN_ADDON_TRUSTED_KEYS=${JSON.stringify(JSON.stringify({ owner: 'existing' }))}`,
    '',
  ].join('\n');
  const merged = mergeTrustedKeyEnvironment(source, metadata);
  const assignment = merged
    .split('\n')
    .find((line) => line.startsWith('YEEN_ADDON_TRUSTED_KEYS='));
  const trusted = JSON.parse(JSON.parse(
    assignment.slice('YEEN_ADDON_TRUSTED_KEYS='.length),
  ));
  assert.deepEqual(trusted, {
    owner: 'existing',
    [metadata.keyId]: metadata.publicKey,
  });
  assert.equal(mergeTrustedKeyEnvironment(merged, metadata), merged);
});

test('trusted publisher merge rejects conflicting key material', () => {
  const conflict = JSON.stringify({ [metadata.keyId]: 'different' });
  assert.throws(
    () => mergeTrustedKeyEnvironment(
      `YEEN_ADDON_TRUSTED_KEYS=${JSON.stringify(conflict)}\n`,
      metadata,
    ),
    /conflicting material/,
  );
});

test('deployment metadata and active registry must match exactly', async () => {
  assert.equal(validateDeploymentMetadata(metadata), metadata);
  const root = await mkdtemp(path.join(tmpdir(), 'yeen-addon-deploy-'));
  try {
    const metadataPath = path.join(root, 'metadata.json');
    const addonsRoot = path.join(root, 'addons');
    const relativeDirectory = `packages/${metadata.id}/${metadata.version}-${metadata.digest}`;
    await mkdir(path.join(addonsRoot, relativeDirectory), { recursive: true });
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
    const registry = {
      schemaVersion: 1,
      allowUnsigned: false,
      restartRequired: false,
      addons: {
        [metadata.id]: {
          id: metadata.id,
          name: metadata.name,
          enabled: true,
          active: {
            version: metadata.version,
            digest: metadata.digest,
            relativeDirectory,
            installedAt: '2026-08-20T00:00:00.000Z',
            trust: 'signed',
            signingKeyId: metadata.keyId,
            serverEntrypoint: 'server/index.cjs',
            webEntrypoint: 'web/index.js',
          },
          pending: null,
          previous: null,
        },
      },
    };
    await writeFile(
      path.join(addonsRoot, 'registry.json'),
      `${JSON.stringify(registry)}\n`,
    );
    await assert.doesNotReject(() => verifyBundledAddon({ metadataPath, addonsRoot }));
    registry.addons[metadata.id].active.digest = 'c'.repeat(64);
    await writeFile(
      path.join(addonsRoot, 'registry.json'),
      `${JSON.stringify(registry)}\n`,
    );
    await assert.rejects(
      () => verifyBundledAddon({ metadataPath, addonsRoot }),
      /not synchronized/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
