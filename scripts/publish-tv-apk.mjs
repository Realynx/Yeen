import { access, copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');

const targetApkPath = path.join(repoRoot, 'artifacts', 'tv', 'yeen-tv.apk');
const targetMetadataPath = path.join(repoRoot, 'artifacts', 'tv', 'yeen-tv.json');
const releaseMode = process.argv.includes('--release');

const debugApkCandidates = [
  path.join(
    repoRoot,
    'apps',
    'web',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'debug',
    'app-debug.apk',
  ),
];

const releaseApkCandidates = [
  path.join(
    repoRoot,
    'apps',
    'web',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk',
  ),
  path.join(
    repoRoot,
    'apps',
    'web',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release-unsigned.apk',
  ),
];

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

const preferredCandidates = releaseMode
  ? [...releaseApkCandidates, ...debugApkCandidates]
  : [...debugApkCandidates, ...releaseApkCandidates];

const sourceApkPath = await firstExistingPath(preferredCandidates);

if (!sourceApkPath) {
  throw new Error(
    'Unable to find built APK. Run "npm run android:build:debug" or "npm run android:build:release" first.',
  );
}

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
