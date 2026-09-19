import {
  createHash,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import { homedir } from 'node:os';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ADDON_ID = 'com.yeen.downloader';
const DEFAULT_KEY_PATH = path.join(
  homedir(),
  '.yeen',
  'keys',
  'downloader.private.pem',
);

export function resolveAddonBuildOptions(options) {
  return {
    addonRoot: path.resolve(options.addonRoot),
    signingKey: path.resolve(options.addonSigningKey || DEFAULT_KEY_PATH),
    archivePath: path.resolve(
      'artifacts',
      'yeen-downloader-addon.deploy.zip',
    ),
    metadataPath: path.resolve(
      'artifacts',
      'yeen-downloader-addon.deploy.json',
    ),
  };
}

export async function prepareBundledAddon(options, run, runNpm) {
  const resolved = resolveAddonBuildOptions(options);
  const manifestPath = path.join(resolved.addonRoot, 'yeen-addon.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.id !== ADDON_ID || typeof manifest.version !== 'string') {
    throw new Error('Downloader Add-on manifest identity is invalid.');
  }

  const privateKey = createPrivateKey(await readFile(resolved.signingKey));
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Downloader Add-on signing key must be Ed25519.');
  }
  const publicDer = createPublicKey(privateKey).export({
    type: 'spki',
    format: 'der',
  });
  const fingerprint = createHash('sha256').update(publicDer).digest('hex');
  const keyId = `ed25519:${fingerprint.slice(0, 32)}`;

  await rm(resolved.archivePath, { force: true });
  await rm(resolved.metadataPath, { force: true });
  await runNpm(
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: resolved.addonRoot },
  );
  await run(process.execPath, ['./scripts/build.mjs'], {
    cwd: resolved.addonRoot,
  });
  await run(
    process.execPath,
    [
      path.resolve('scripts/addons/pack-addon.mjs'),
      '--source',
      path.join(resolved.addonRoot, 'prebuilt'),
      '--key',
      resolved.signingKey,
      '--out',
      resolved.archivePath,
    ],
  );

  const archive = await readFile(resolved.archivePath);
  const digest = createHash('sha256').update(archive).digest('hex');
  const metadata = {
    schemaVersion: 1,
    id: ADDON_ID,
    name: manifest.name,
    version: manifest.version,
    digest,
    keyId,
    publicKey: publicDer.toString('base64'),
  };
  await writeFile(
    resolved.metadataPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    { mode: 0o600 },
  );

  return {
    ...resolved,
    metadata,
    buildEnvironment: {
      YEEN_BUNDLED_ADDON_ARCHIVE: resolved.archivePath,
      YEEN_BUNDLED_ADDON_METADATA: resolved.metadataPath,
    },
  };
}
