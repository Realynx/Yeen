import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBuiltApk } from './android/android-build-guard.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');

const targetApkPath = path.join(repoRoot, 'artifacts', 'tv', 'yeen-tv.apk');
const targetMetadataPath = path.join(repoRoot, 'artifacts', 'tv', 'yeen-tv.json');
const releaseMode = process.argv.includes('--release');

const sourceApkPath = await findBuiltApk(
  repoRoot,
  releaseMode ? 'release' : 'debug',
);

await mkdir(path.dirname(targetApkPath), { recursive: true });
await copyFile(sourceApkPath, targetApkPath);

const copiedStats = await stat(targetApkPath);
const metadata = {
  sourcePath: sourceApkPath,
  publishedPath: targetApkPath,
  sizeBytes: copiedStats.size,
  publishedAtIso: new Date().toISOString(),
  mode: releaseMode ? 'release' : 'debug',
};

await writeFile(targetMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

console.log(`Published APK: ${targetApkPath}`);
console.log(`Source APK: ${sourceApkPath}`);
console.log(`Metadata: ${targetMetadataPath}`);
