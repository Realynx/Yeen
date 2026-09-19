import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const webRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(webRoot, 'dist');
const failures = [];

async function requireFile(relativePath) {
  const absolutePath = path.join(distRoot, relativePath);
  try {
    await access(absolutePath);
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile() || fileStats.size === 0) {
      failures.push(`${relativePath} is empty or is not a file`);
    }
  } catch {
    failures.push(`${relativePath} is missing`);
  }
  return absolutePath;
}

function readPngDimensions(buffer) {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature || buffer.length < 24) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const indexPath = await requireFile('index.html');
const manifestPath = await requireFile('manifest.webmanifest');
const serviceWorkerPath = await requireFile('sw.js');

for (const [iconPath, expectedSize] of [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['pwa-maskable-512x512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const absoluteIconPath = await requireFile(iconPath);
  try {
    const dimensions = readPngDimensions(await readFile(absoluteIconPath));
    if (
      !dimensions
      || dimensions.width !== expectedSize
      || dimensions.height !== expectedSize
    ) {
      failures.push(`${iconPath} must be a ${expectedSize}x${expectedSize} PNG`);
    }
  } catch {
    // Missing files are already reported by requireFile.
  }
}

try {
  const indexHtml = await readFile(indexPath, 'utf8');
  if (!/<link\s+rel=["']manifest["'][^>]+manifest\.webmanifest/i.test(indexHtml)) {
    failures.push('index.html does not link manifest.webmanifest');
  }
  if (!/name=["']theme-color["'][^>]+#070910/i.test(indexHtml)) {
    failures.push('index.html does not expose the expected PWA theme color');
  }
} catch {
  // Missing files are already reported by requireFile.
}

try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.id !== '/' || manifest.start_url !== '/' || manifest.scope !== '/') {
    failures.push('manifest identity, start_url, and scope must remain rooted at /');
  }
  if (manifest.display !== 'standalone') {
    failures.push('manifest display mode must be standalone');
  }
  const purposes = new Set(
    (manifest.icons ?? []).flatMap((icon) => String(icon.purpose ?? 'any').split(/\s+/)),
  );
  if (!purposes.has('any') || !purposes.has('maskable')) {
    failures.push('manifest must provide both regular and maskable icons');
  }
  const shortcutUrls = new Set(
    (manifest.shortcuts ?? []).map((shortcut) => String(shortcut.url)),
  );
  for (const requiredShortcut of ['/', '/music', '/library']) {
    if (!shortcutUrls.has(requiredShortcut)) {
      failures.push(`manifest is missing the ${requiredShortcut} app shortcut`);
    }
  }
} catch (error) {
  failures.push(`manifest.webmanifest is invalid JSON: ${error.message}`);
}

try {
  const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
  if (!serviceWorker.includes('manifest.webmanifest')) {
    failures.push('sw.js does not include the generated app-shell precache');
  }
  if (/\.(?:m4a|m4v|mkv|mp3|mp4|ogg|opus|wav|webm)["']/i.test(serviceWorker)) {
    failures.push('sw.js must not precache user media or playback files');
  }
} catch {
  // Missing files are already reported by requireFile.
}

if (failures.length > 0) {
  console.error('PWA build audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('PWA build audit passed. Manifest, icons, offline shell, and SW are present.');
}
