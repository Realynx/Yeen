import { generateKeyPair } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputPrefix = option('--out');
if (!outputPrefix) {
  throw new Error('Usage: npm run addon:keygen -- --out <private-output-prefix>');
}

const resolvedPrefix = path.resolve(outputPrefix);
const privatePath = `${resolvedPrefix}.private.pem`;
const publicPath = `${resolvedPrefix}.public.pem`;

for (const candidate of [privatePath, publicPath]) {
  const exists = await access(candidate).then(() => true, () => false);
  if (exists) {
    throw new Error(`Refusing to overwrite existing key: ${candidate}`);
  }
}

await mkdir(path.dirname(resolvedPrefix), { recursive: true });
const { privateKey, publicKey } = await new Promise((resolve, reject) => {
  generateKeyPair(
    'ed25519',
    {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    },
    (error, generatedPublicKey, generatedPrivateKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        privateKey: generatedPrivateKey,
        publicKey: generatedPublicKey,
      });
    },
  );
});

await writeFile(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
await writeFile(publicPath, publicKey, { encoding: 'utf8', mode: 0o644 });

console.log(`Private signing key: ${privatePath}`);
console.log(`Trusted public key: ${publicPath}`);
console.log('Keep the private key outside Core Yeen and never upload it to the server.');
