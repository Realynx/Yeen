import { access, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');

const androidProjectPath = path.join(repoRoot, 'apps', 'web', 'android');
const localPropertiesPath = path.join(androidProjectPath, 'local.properties');

const envSdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
].filter(Boolean);

const windowsSdkCandidates = [
  'C:/Program Files (x86)/Android/android-sdk',
  'C:/Program Files/Android/android-sdk',
];

const defaultSdkCandidates = [
  path.join(os.homedir(), 'android-sdk'),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'sdk'),
  ...(process.platform === 'win32'
    ? windowsSdkCandidates.map((candidate) => path.resolve(candidate))
    : []),
];

function toUniquePaths(paths) {
  return [...new Set(paths.map((candidate) => path.resolve(candidate)))];
}

function toGradlePath(value) {
  return value.replace(/\\/g, '/');
}

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function isSdkRoot(candidatePath) {
  const adbWindows = path.join(candidatePath, 'platform-tools', 'adb.exe');
  const adbUnix = path.join(candidatePath, 'platform-tools', 'adb');
  return (await pathExists(adbWindows)) || (await pathExists(adbUnix));
}

async function resolveSdkRoot() {
  const candidates = toUniquePaths([...envSdkCandidates, ...defaultSdkCandidates]);

  for (const candidate of candidates) {
    if (await isSdkRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate Android SDK. Checked: ${candidates.join(', ')}. `
    + 'Install Android SDK or set ANDROID_HOME/ANDROID_SDK_ROOT.',
  );
}

if (!(await pathExists(androidProjectPath))) {
  throw new Error(
    'Android project not found at apps/web/android. Run "npm run android:add" first.',
  );
}

const sdkRoot = await resolveSdkRoot();
const localPropertiesContent = `sdk.dir=${toGradlePath(sdkRoot)}\n`;

await writeFile(localPropertiesPath, localPropertiesContent, 'utf8');

console.log(`Wrote ${localPropertiesPath}`);
console.log(`Using Android SDK at ${sdkRoot}`);
