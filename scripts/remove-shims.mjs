import fs from 'node:fs/promises';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');

const SOURCE_ROOTS = [
  path.resolve('apps/web/src'),
  path.resolve('apps/server/src'),
];

const EXCLUDED_DIR_SEGMENTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}build${path.sep}`,
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

const SKIP_SHIM_DIRS = [
  path.resolve('apps/web/src/features'),
  path.resolve('apps/server/src/domains'),
];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function withDotPrefix(specifier) {
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function normalizeNoExtension(specifier) {
  return specifier.replace(/\.(ts|tsx|mts|cts)$/i, '');
}

function isShimFile(content) {
  const lines = content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0 || lines.length > 3) {
    return false;
  }

  return lines.every(
    (line) =>
      /^export\s+\*\s+from\s+['"][^'"]+['"];?$/.test(line) ||
      /^export\s+\{\s*default\s*\}\s+from\s+['"][^'"]+['"];?$/.test(line),
  );
}

function parseMainExportTarget(content) {
  const lines = content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const exportAll = lines.find((line) => /^export\s+\*\s+from\s+['"][^'"]+['"];?$/.test(line));
  if (!exportAll) {
    return null;
  }
  const match = exportAll.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"];?$/);
  return match ? match[1] : null;
}

async function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (EXCLUDED_DIR_SEGMENTS.some((seg) => fullPath.includes(seg))) {
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

function isUnderAnyDir(filePath, dirs) {
  return dirs.some((dir) => filePath.startsWith(dir));
}

async function listShimFiles() {
  const allSourceFiles = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const files = await walkFiles(sourceRoot);
    allSourceFiles.push(...files);
  }

  const shimFiles = [];
  for (const filePath of allSourceFiles) {
    if (isUnderAnyDir(filePath, SKIP_SHIM_DIRS)) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    if (!isShimFile(content)) {
      continue;
    }

    const relTarget = parseMainExportTarget(content);
    if (!relTarget || !relTarget.startsWith('.')) {
      continue;
    }

    const absTarget = path.resolve(path.dirname(filePath), relTarget);
    shimFiles.push({
      filePath,
      relTarget,
      absTarget,
    });
  }

  return { allSourceFiles, shimFiles };
}

function buildShimSpecifierMap(shimFiles) {
  const map = new Map();
  for (const shim of shimFiles) {
    const keyBase = toPosix(path.resolve(shim.filePath));
    map.set(keyBase, shim);
    for (const ext of SOURCE_EXTENSIONS) {
      map.set(`${keyBase}${ext}`, shim);
    }
  }
  return map;
}

function rewriteImportSpecifier(specifier, importerPath, shimByResolvedPath) {
  if (!specifier.startsWith('.')) {
    return { changed: false, next: specifier };
  }

  const importerDir = path.dirname(importerPath);
  const resolved = path.resolve(importerDir, specifier);

  const candidates = [toPosix(resolved)];
  const ext = path.extname(resolved).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) {
    for (const sourceExt of SOURCE_EXTENSIONS) {
      candidates.push(toPosix(`${resolved}${sourceExt}`));
      candidates.push(toPosix(path.join(resolved, `index${sourceExt}`)));
    }
  }

  let match = null;
  for (const candidate of candidates) {
    const maybe = shimByResolvedPath.get(candidate);
    if (maybe) {
      match = maybe;
      break;
    }
  }

  if (!match) {
    return { changed: false, next: specifier };
  }

  let rewritten = path.relative(importerDir, match.absTarget);
  rewritten = normalizeNoExtension(toPosix(rewritten));
  rewritten = withDotPrefix(rewritten || '.');

  return {
    changed: rewritten !== specifier,
    next: rewritten,
  };
}

function rewriteImports(content, importerPath, shimByResolvedPath) {
  let changed = false;

  const fromPattern = /(\bfrom\s*['"])([^'"]+)(['"])/g;
  const dynamicImportPattern = /(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;
  const requirePattern = /(\brequire\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;
  const sideEffectImportPattern = /(^|[\r\n;]\s*)(import\s+['"])([^'"]+)(['"])/gm;

  const applyPattern = (text, pattern, indexOfSpecifier = 2) => {
    return text.replace(pattern, (...args) => {
      const full = args[0];
      const parts = args.slice(1, 4);
      const specifier = parts[indexOfSpecifier - 1];
      const result = rewriteImportSpecifier(specifier, importerPath, shimByResolvedPath);
      if (!result.changed) {
        return full;
      }
      changed = true;
      parts[indexOfSpecifier - 1] = result.next;
      return parts.join('');
    });
  };

  let next = content;
  next = applyPattern(next, fromPattern, 2);
  next = applyPattern(next, dynamicImportPattern, 2);
  next = applyPattern(next, requirePattern, 2);
  next = next.replace(sideEffectImportPattern, (full, preface, keyword, specifier, suffix) => {
    const result = rewriteImportSpecifier(specifier, importerPath, shimByResolvedPath);
    if (!result.changed) {
      return full;
    }
    changed = true;
    return `${preface}${keyword}${result.next}${suffix}`;
  });

  return { changed, next };
}

async function removeEmptyDirs(startDir, stopRoots) {
  let current = startDir;
  while (current && !stopRoots.includes(current)) {
    let entries;
    try {
      entries = await fs.readdir(current);
    } catch {
      return;
    }

    if (entries.length > 0) {
      return;
    }

    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

async function main() {
  const { allSourceFiles, shimFiles } = await listShimFiles();
  const shimByResolvedPath = buildShimSpecifierMap(shimFiles);

  const filesToRewrite = allSourceFiles.filter(
    (filePath) => !shimFiles.some((shim) => shim.filePath === filePath),
  );

  const rewriteQueue = [];
  for (const filePath of filesToRewrite) {
    const content = await fs.readFile(filePath, 'utf8');
    const { changed, next } = rewriteImports(content, filePath, shimByResolvedPath);
    if (!changed) {
      continue;
    }
    rewriteQueue.push({ filePath, next });
  }

  console.log(`shimFiles=${shimFiles.length}`);
  console.log(`importFilesToRewrite=${rewriteQueue.length}`);

  if (!APPLY) {
    console.log('dryRun=true (pass --apply to rewrite imports and delete shims)');
    return;
  }

  for (const item of rewriteQueue) {
    await fs.writeFile(item.filePath, item.next);
  }

  for (const shim of shimFiles) {
    await fs.unlink(shim.filePath);
    await removeEmptyDirs(path.dirname(shim.filePath), SOURCE_ROOTS);
  }

  console.log(`rewrittenFiles=${rewriteQueue.length}`);
  console.log(`deletedShimFiles=${shimFiles.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
