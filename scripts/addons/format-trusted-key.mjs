import { createHash, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const publicKeyInput = option('--key');
if (!publicKeyInput) {
  throw new Error(
    'Usage: npm run addon:trust-key -- --key <publisher.public.pem>',
  );
}

const publicKeyPath = path.resolve(publicKeyInput);
const publicKey = createPublicKey(await readFile(publicKeyPath, 'utf8'));
if (publicKey.asymmetricKeyType !== 'ed25519') {
  throw new Error('The trusted publisher key must be an Ed25519 public key.');
}

const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const fingerprint = createHash('sha256').update(publicDer).digest('hex');
const keyId = `ed25519:${fingerprint.slice(0, 32)}`;
const trustedKeys = JSON.stringify({ [keyId]: publicDer.toString('base64') });

console.log(`Key ID: ${keyId}`);
console.log(`YEEN_ADDON_TRUSTED_KEYS=${trustedKeys}`);
