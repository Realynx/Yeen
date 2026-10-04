import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const privatePath = /(^|\/)(?:\.?private|\.yeen-addons|node_modules|data)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$|production$))|\.private\.pem$|\.yeen-addon\.zip$|\.sqlite(?:$|-)|(?:^|\/)deployment\/addons(?:\/|$)/i;
const implementationPath = /(?:downloader-builtin|torrent-(?:search|intake|data-availability|access)|domains\/torrent|deploy-addon-bundle|deploy-ssh|addon-deploy)/i;
const privateWorkflow = /YEEN_BUNDLED_ADDON_|YEEN_DOWNLOADER_ADDON_|com\.yeen\.downloader|private\/yeen-downloader|\b(?:iptorrents|qbittorrent|prowlarr|jackett)\b|magnet:\?xt=/i;
const policyFiles = new Set([
  'scripts/release/public-policy.mjs',
  'scripts/release/public-policy.test.mjs',
]);

export function publicFileViolation(relativePath, content = '') {
  const normalized = relativePath.replaceAll('\\', '/');
  if (privatePath.test(normalized) || implementationPath.test(normalized)) {
    return 'private implementation or runtime state';
  }
  if (!policyFiles.has(normalized) && privateWorkflow.test(content)) {
    return 'private workflow reference';
  }
  return null;
}

/** Inspect only paths and report no file contents, which may include secrets. */
export async function assertPublicFiles(root, files) {
  const failures = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    let metadata;
    try {
      metadata = await lstat(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // Working-tree deletion.
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      failures.push(`${file}: symbolic link`);
      continue;
    }
    if (!metadata.isFile()) continue;
    const content = await readFile(absolute, 'utf8');
    const violation = publicFileViolation(file, content);
    if (violation) failures.push(`${file}: ${violation}`);
  }
  if (failures.length) throw new Error(`Public boundary failed:\n${failures.join('\n')}`);
}

export async function assertPublicDirectory(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => !entry.isDirectory()).map((entry) =>
    path.relative(root, path.join(entry.parentPath, entry.name)),
  );
  await assertPublicFiles(root, files);
}
