import fs from 'node:fs/promises';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SOURCE_ROOT = path.resolve('apps/web/src');

const MOVES = [
  ['apps/web/src/pages/media-library/MediaLibraryToolbar.tsx', 'apps/web/src/features/library/components/MediaLibraryToolbar.tsx'],
  ['apps/web/src/pages/media-library/MediaLibraryLocalResultsSection.tsx', 'apps/web/src/features/library/components/MediaLibraryLocalResultsSection.tsx'],
  ['apps/web/src/pages/media-library/MediaLibraryRemoteResultsSection.tsx', 'apps/web/src/features/library/components/MediaLibraryRemoteResultsSection.tsx'],
  ['apps/web/src/pages/media-details/MediaDetailsHero.tsx', 'apps/web/src/features/media-details/components/MediaDetailsHero.tsx'],
  ['apps/web/src/pages/media-details/MediaTorrentSearchPopover.tsx', 'apps/web/src/features/media-details/components/MediaTorrentSearchPopover.tsx'],
  ['apps/web/src/pages/media-details/MediaTorrentSearchPopoverPhone.tsx', 'apps/web/src/features/media-details/components/MediaTorrentSearchPopoverPhone.tsx'],
  ['apps/web/src/pages/media-details/sections/DownloadProgressSection.tsx', 'apps/web/src/features/media-details/components/sections/DownloadProgressSection.tsx'],
  ['apps/web/src/pages/media-details/sections/EpisodesSection.tsx', 'apps/web/src/features/media-details/components/sections/EpisodesSection.tsx'],
  ['apps/web/src/pages/media-details/sections/IptorrentsResultCards.tsx', 'apps/web/src/features/media-details/components/sections/IptorrentsResultCards.tsx'],
  ['apps/web/src/pages/media-details/sections/IptorrentsResultsSection.tsx', 'apps/web/src/features/media-details/components/sections/IptorrentsResultsSection.tsx'],
  ['apps/web/src/pages/media-details/sections/IptorrentsSortToolbar.tsx', 'apps/web/src/features/media-details/components/sections/IptorrentsSortToolbar.tsx'],
  ['apps/web/src/pages/media-details/sections/ScenePreviewsSection.tsx', 'apps/web/src/features/media-details/components/sections/ScenePreviewsSection.tsx'],
  ['apps/web/src/pages/media-details/sections/SeriesCollectionSection.tsx', 'apps/web/src/features/media-details/components/sections/SeriesCollectionSection.tsx'],
  ['apps/web/src/pages/media-details/sections/SeriesCompletenessSection.tsx', 'apps/web/src/features/media-details/components/sections/SeriesCompletenessSection.tsx'],
  ['apps/web/src/pages/media-details/sections/TechnicalDetailsSection.tsx', 'apps/web/src/features/media-details/components/sections/TechnicalDetailsSection.tsx'],
].map(([from, to]) => ({ from: path.resolve(from), to: path.resolve(to) }));

function toPosix(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function withDotPrefix(specifier) {
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function stripSourceExtension(specifier) {
  return specifier.replace(/\.(ts|tsx|mts|cts)$/i, '');
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveImportTarget(importerFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.resolve(path.dirname(importerFile), specifier);
  const ext = path.extname(base).toLowerCase();

  const candidates = [];
  if (SOURCE_EXTENSIONS.includes(ext)) {
    candidates.push(base);
  } else {
    candidates.push(base);
    for (const sourceExt of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${sourceExt}`);
      candidates.push(path.join(base, `index${sourceExt}`));
    }
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}

async function rewriteRelativeImports(content, importerFile, destinationFile, moveLookup) {
  let changed = false;

  const rewriteSpecifier = async (specifier) => {
    if (!specifier.startsWith('.')) {
      return specifier;
    }

    const resolved = await resolveImportTarget(importerFile, specifier);
    if (!resolved) {
      return specifier;
    }

    const target = moveLookup.get(resolved) ?? resolved;
    let relative = path.relative(path.dirname(destinationFile), target);
    relative = stripSourceExtension(toPosix(relative));
    relative = withDotPrefix(relative || '.');

    if (relative !== specifier) {
      changed = true;
    }

    return relative;
  };

  const fromPattern = /(\bfrom\s*['"])([^'"\n]+)(['"])/g;
  const dynamicImportPattern = /(\bimport\s*\(\s*['"])([^'"\n]+)(['"]\s*\))/g;
  const requirePattern = /(\brequire\s*\(\s*['"])([^'"\n]+)(['"]\s*\))/g;
  const sideEffectImportPattern = /(^|[\r\n;]\s*)(import\s+['"])([^'"\n]+)(['"])/gm;

  let next = content;

  const rewriteMatches = async (input, pattern, type) => {
    const matches = [...input.matchAll(pattern)];
    if (matches.length === 0) {
      return input;
    }

    let output = input;
    let offset = 0;

    for (const match of matches) {
      const full = match[0];
      const index = match.index ?? 0;
      const prefix = match[1];
      const specifier = match[2];
      const suffix = match[3];
      const rewrittenSpecifier = await rewriteSpecifier(specifier);
      if (rewrittenSpecifier === specifier) {
        continue;
      }

      const replacement =
        type === 'side-effect'
          ? `${prefix}${match[2]}${rewrittenSpecifier}${suffix}`
          : `${prefix}${rewrittenSpecifier}${suffix}`;

      const start = index + offset;
      const end = start + full.length;
      output = `${output.slice(0, start)}${replacement}${output.slice(end)}`;
      offset += replacement.length - full.length;
    }

    return output;
  };

  next = await rewriteMatches(next, fromPattern, 'from');
  next = await rewriteMatches(next, dynamicImportPattern, 'dynamic');
  next = await rewriteMatches(next, requirePattern, 'require');

  // Side-effect pattern has different capture positions.
  const sideMatches = [...next.matchAll(sideEffectImportPattern)];
  if (sideMatches.length > 0) {
    let output = next;
    let offset = 0;
    for (const match of sideMatches) {
      const full = match[0];
      const index = match.index ?? 0;
      const prefix = match[1];
      const importKeyword = match[2];
      const specifier = match[3];
      const suffix = match[4];
      const rewrittenSpecifier = await rewriteSpecifier(specifier);
      if (rewrittenSpecifier === specifier) {
        continue;
      }

      const replacement = `${prefix}${importKeyword}${rewrittenSpecifier}${suffix}`;
      const start = index + offset;
      const end = start + full.length;
      output = `${output.slice(0, start)}${replacement}${output.slice(end)}`;
      offset += replacement.length - full.length;
    }
    next = output;
  }

  return { changed, next };
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
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

async function ensureMoveInputs() {
  for (const move of MOVES) {
    if (!(await fileExists(move.from))) {
      throw new Error(`Missing source file for move: ${path.relative(process.cwd(), move.from)}`);
    }
  }
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore missing file.
  }
}

async function removeEmptyDirs(startDir, stopDir) {
  let current = startDir;
  while (current.startsWith(stopDir) && current !== stopDir) {
    const entries = await fs.readdir(current);
    if (entries.length > 0) {
      return;
    }
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

async function main() {
  await ensureMoveInputs();

  const moveLookup = new Map(MOVES.map((move) => [path.resolve(move.from), path.resolve(move.to)]));

  const movedFileWrites = [];
  for (const move of MOVES) {
    const content = await fs.readFile(move.from, 'utf8');
    const rewritten = await rewriteRelativeImports(content, move.from, move.to, moveLookup);
    movedFileWrites.push({ move, content: rewritten.next });
  }

  const allWebFiles = await walkFiles(SOURCE_ROOT);
  const movedFromSet = new Set(MOVES.map((move) => path.resolve(move.from)));

  const importerWrites = [];
  for (const filePath of allWebFiles) {
    if (movedFromSet.has(path.resolve(filePath))) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const rewritten = await rewriteRelativeImports(content, filePath, filePath, moveLookup);
    if (!rewritten.changed) {
      continue;
    }

    importerWrites.push({ filePath, content: rewritten.next });
  }

  console.log(`moves=${MOVES.length}`);
  console.log(`updatedMovedFiles=${movedFileWrites.length}`);
  console.log(`updatedImporters=${importerWrites.length}`);

  if (!APPLY) {
    console.log('dryRun=true (pass --apply to move files and rewrite imports)');
    return;
  }

  for (const item of movedFileWrites) {
    await fs.mkdir(path.dirname(item.move.to), { recursive: true });
    await fs.writeFile(item.move.to, item.content);
  }

  for (const item of importerWrites) {
    await fs.writeFile(item.filePath, item.content);
  }

  for (const item of movedFileWrites) {
    await removeIfExists(item.move.from);
    await removeEmptyDirs(path.dirname(item.move.from), SOURCE_ROOT);
  }

  console.log(`movedApplied=${movedFileWrites.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
