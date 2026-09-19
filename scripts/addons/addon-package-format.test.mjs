import { generateKeyPairSync, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSignatureDocument,
  deriveSigningKeyId,
  isSafePackagePath,
  serializeIntegrityDocument,
  validateAddonManifest,
} from './addon-package-format.mjs';

const validManifest = {
  schemaVersion: 1,
  id: 'com.example.downloader',
  name: 'Downloader Add-on',
  version: '1.2.3',
  addonApiVersion: 1,
  core: { minimumVersion: '1.0.0', maximumVersionExclusive: '2.0.0' },
  entrypoints: { server: 'server/index.cjs', web: 'web/index.js' },
};

test('validates the versioned add-on manifest', () => {
  assert.equal(validateAddonManifest(validManifest), validManifest);
  assert.throws(
    () => validateAddonManifest({ ...validManifest, id: '../downloader' }),
    /reverse-domain-style/,
  );
});

test('rejects unsafe archive paths', () => {
  assert.equal(isSafePackagePath('server/index.cjs'), true);
  for (const candidate of ['../secret', '/root/file', 'C:/file', 'a\\b', 'a//b']) {
    assert.equal(isSafePackagePath(candidate), false, candidate);
  }
});

test('serializes and signs canonical integrity bytes with Ed25519', () => {
  const integrityBytes = serializeIntegrityDocument({
    schemaVersion: 1,
    algorithm: 'sha256',
    files: [
      { path: 'server/index.cjs', size: 4, sha256: 'a'.repeat(64) },
      { path: 'yeen-addon.json', size: 8, sha256: 'b'.repeat(64) },
    ],
  });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = deriveSigningKeyId(privateKey);
  const signature = createSignatureDocument(integrityBytes, privateKey, keyId);
  assert.match(keyId, /^ed25519:[a-f0-9]{32}$/);
  assert.equal(
    verify(null, integrityBytes, publicKey, Buffer.from(signature.signature, 'base64')),
    true,
  );
});
