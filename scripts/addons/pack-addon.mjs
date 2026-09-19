import { createPrivateKey } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import {
  INTEGRITY_FILE,
  PACKAGE_LIMITS,
  SIGNATURE_FILE,
  buildIntegrityDocument,
  collectPayloadFiles,
  createSignatureDocument,
  deriveSigningKeyId,
  readAndValidateManifest,
  serializeIntegrityDocument,
} from './addon-package-format.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  const prefix = `${name}=`;
  const inlineOption = process.argv.find((argument) => argument.startsWith(prefix));
  if (inlineOption) {
    return inlineOption.slice(prefix.length);
  }

  // npm may consume option-shaped arguments after `npm run ... --` and expose
  // them as npm_config_* environment values instead of forwarding argv.
  const npmConfigName = `npm_config_${name.slice(2).replaceAll('-', '_')}`;
  return process.env[npmConfigName];
}

const sourceInput = option('--source');
const keyInput = option('--key');
const outputInput = option('--out');
const requestedKeyId = option('--key-id');
const unsigned = process.argv.includes('--unsigned');
if (!sourceInput || !outputInput || (!unsigned && !keyInput)) {
  throw new Error(
    [
      'Usage: npm run addon:pack -- --source <prebuilt-directory>',
      '--out <package.zip>',
      '(--key <private.pem> [--key-id <id>] | --unsigned)',
    ].join(' '),
  );
}
if (unsigned && (keyInput || requestedKeyId)) {
  throw new Error('--unsigned cannot be combined with --key or --key-id.');
}

const sourceDirectory = path.resolve(sourceInput);
const outputPath = path.resolve(outputInput);
if (path.extname(outputPath).toLowerCase() !== '.zip') {
  throw new Error('The add-on package output must end in .zip.');
}
if (outputPath === sourceDirectory || outputPath.startsWith(`${sourceDirectory}${path.sep}`)) {
  throw new Error('The output ZIP must be outside the prebuilt source directory.');
}
const sourceStat = await stat(sourceDirectory).catch(() => null);
if (!sourceStat?.isDirectory()) {
  throw new Error(`Prebuilt source directory was not found: ${sourceDirectory}`);
}
if (await access(outputPath).then(() => true, () => false)) {
  throw new Error(`Refusing to overwrite an existing package: ${outputPath}`);
}

const manifest = await readAndValidateManifest(sourceDirectory);
const files = await collectPayloadFiles(sourceDirectory);
const integrity = await buildIntegrityDocument(files);
const integrityBytes = serializeIntegrityDocument(integrity);
let keyId = null;
let signatureBytes = null;
if (!unsigned) {
  const privateKeyPath = path.resolve(keyInput);
  if (!(await access(privateKeyPath).then(() => true, () => false))) {
    throw new Error(`Private signing key was not found: ${privateKeyPath}`);
  }
  const privateKey = createPrivateKey(await readFile(privateKeyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('The signing key must be an Ed25519 private key.');
  }
  keyId = requestedKeyId ?? deriveSigningKeyId(privateKey);
  const signature = createSignatureDocument(integrityBytes, privateKey, keyId);
  signatureBytes = Buffer.from(`${JSON.stringify(signature)}\n`, 'utf8');
}

await mkdir(path.dirname(outputPath), { recursive: true });
const partialPath = `${outputPath}.partial`;
await rm(partialPath, { force: true });
const fixedDate = new Date('1980-01-01T00:00:00.000Z');

try {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(partialPath, { mode: 0o600 });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.pipe(output);
    for (const file of files) {
      archive.file(file.absolutePath, {
        name: file.path,
        date: fixedDate,
        mode: 0o644,
      });
    }
    archive.append(integrityBytes, {
      name: INTEGRITY_FILE,
      date: fixedDate,
      mode: 0o644,
    });
    if (signatureBytes) {
      archive.append(signatureBytes, {
        name: SIGNATURE_FILE,
        date: fixedDate,
        mode: 0o644,
      });
    }
    archive.finalize().catch(reject);
  });

  const packageStat = await stat(partialPath);
  if (packageStat.size > PACKAGE_LIMITS.compressedBytes) {
    throw new Error(`ZIP exceeds the ${PACKAGE_LIMITS.compressedBytes} byte compressed limit.`);
  }
  await rename(partialPath, outputPath);
} catch (error) {
  await rm(partialPath, { force: true });
  throw error;
}

console.log(`Packed ${manifest.id}@${manifest.version}`);
console.log(unsigned ? 'Trust: unsigned' : `Key ID: ${keyId}`);
console.log(`Package: ${outputPath}`);
