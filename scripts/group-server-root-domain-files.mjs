import fs from 'node:fs/promises';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');

const SOURCE_ROOT = path.resolve('apps/server/src');
const DOMAIN_ROOT = path.resolve('apps/server/src/domains');
const LEGACY_DOMAIN_DIRS = [
  'auth',
  'media',
  'progress',
  'stream',
  'subtitle',
  'system-settings',
  'torrent',
];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

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

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
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

function classifyBaseTargetDir(domain, relativeParts, baseName) {
  const first = relativeParts[0] ?? '';

  if (first === 'dto') {
    return path.join(DOMAIN_ROOT, domain, 'application', 'dto', ...relativeParts.slice(1));
  }

  if (first === 'entities') {
    return path.join(DOMAIN_ROOT, domain, 'domain', 'entities', ...relativeParts.slice(1));
  }

  if (baseName.endsWith('.module.ts')) {
    return path.join(DOMAIN_ROOT, domain);
  }

  if (baseName.includes('.store.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'stores');
  }

  if (baseName.includes('.guard.')) {
    return path.join(DOMAIN_ROOT, domain, 'presentation', 'guards');
  }

  if (baseName.includes('.decorator.')) {
    return path.join(DOMAIN_ROOT, domain, 'presentation', 'decorators');
  }

  if (baseName.includes('.strategy.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'strategies');
  }

  if (baseName.includes('.client.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'clients');
  }

  if (baseName.includes('.resolver.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'resolvers');
  }

  if (baseName.includes('.adapter.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'adapters');
  }

  if (baseName.includes('.reader.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'readers');
  }

  if (baseName.includes('.parser.')) {
    return path.join(DOMAIN_ROOT, domain, 'domain', 'parsers');
  }

  if (baseName.includes('.normalizer.')) {
    return path.join(DOMAIN_ROOT, domain, 'domain', 'normalizers');
  }

  if (baseName.includes('.sanitizer.')) {
    return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'sanitizers');
  }

  if (baseName.includes('.types.')) {
    return path.join(DOMAIN_ROOT, domain, 'application', 'types');
  }

  return path.join(DOMAIN_ROOT, domain, 'infrastructure', 'support');
}

function destinationForFile(filePath) {
  const relativeToSource = path.relative(SOURCE_ROOT, filePath);
  const parts = relativeToSource.split(path.sep);
  const domain = parts[0] ?? '';
  const relativeParts = parts.slice(1);
  const baseName = path.basename(filePath);

  if (!LEGACY_DOMAIN_DIRS.includes(domain)) {
    return null;
  }

  const isSpec = baseName.endsWith('.spec.ts');
  const counterpartBaseName = isSpec ? `${baseName.slice(0, -'.spec.ts'.length)}.ts` : baseName;

  const baseDir = classifyBaseTargetDir(domain, relativeParts, counterpartBaseName);
  return path.join(baseDir, baseName);
}

async function buildMoveList() {
  const moves = [];

  for (const legacyDir of LEGACY_DOMAIN_DIRS) {
    const legacyPath = path.join(SOURCE_ROOT, legacyDir);
    if (!(await directoryExists(legacyPath))) {
      continue;
    }

    const files = await walkFiles(legacyPath);
    for (const filePath of files) {
      const destination = destinationForFile(filePath);
      if (!destination) {
        continue;
      }

      if (path.resolve(filePath) === path.resolve(destination)) {
        continue;
      }

      moves.push({
        from: path.resolve(filePath),
        to: path.resolve(destination),
      });
    }
  }

  return moves;
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

  const rewriteByRegex = async (input, pattern, getParts, buildReplacement) => {
    const matches = [...input.matchAll(pattern)];
    if (matches.length === 0) {
      return input;
    }

    let output = input;
    let offset = 0;

    for (const match of matches) {
      const full = match[0];
      const index = match.index ?? 0;
      const parts = getParts(match);
      const rewrittenSpecifier = await rewriteSpecifier(parts.specifier);
      if (rewrittenSpecifier === parts.specifier) {
        continue;
      }

      const replacement = buildReplacement(parts, rewrittenSpecifier);
      const start = index + offset;
      const end = start + full.length;
      output = `${output.slice(0, start)}${replacement}${output.slice(end)}`;
      offset += replacement.length - full.length;
    }

    return output;
  };

  let next = content;
  next = await rewriteByRegex(
    next,
    fromPattern,
    (m) => ({ prefix: m[1], specifier: m[2], suffix: m[3] }),
    (parts, rewritten) => `${parts.prefix}${rewritten}${parts.suffix}`,
  );

  next = await rewriteByRegex(
    next,
    dynamicImportPattern,
    (m) => ({ prefix: m[1], specifier: m[2], suffix: m[3] }),
    (parts, rewritten) => `${parts.prefix}${rewritten}${parts.suffix}`,
  );

  next = await rewriteByRegex(
    next,
    requirePattern,
    (m) => ({ prefix: m[1], specifier: m[2], suffix: m[3] }),
    (parts, rewritten) => `${parts.prefix}${rewritten}${parts.suffix}`,
  );

  next = await rewriteByRegex(
    next,
    sideEffectImportPattern,
    (m) => ({ prefix: `${m[1]}${m[2]}`, specifier: m[3], suffix: m[4] }),
    (parts, rewritten) => `${parts.prefix}${rewritten}${parts.suffix}`,
  );

  return { changed, next };
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
  const moves = await buildMoveList();
  const moveLookup = new Map(moves.map((move) => [move.from, move.to]));

  const movedWrites = [];
  for (const move of moves) {
    const content = await fs.readFile(move.from, 'utf8');
    const rewritten = await rewriteRelativeImports(content, move.from, move.to, moveLookup);
    movedWrites.push({ move, content: rewritten.next });
  }

  const allServerFiles = await walkFiles(SOURCE_ROOT);
  const movedFromSet = new Set(moves.map((move) => move.from));

  const importerWrites = [];
  for (const filePath of allServerFiles) {
    const absolute = path.resolve(filePath);
    if (movedFromSet.has(absolute)) {
      continue;
    }

    const content = await fs.readFile(absolute, 'utf8');
    const rewritten = await rewriteRelativeImports(content, absolute, absolute, moveLookup);
    if (!rewritten.changed) {
      continue;
    }

    importerWrites.push({ filePath: absolute, content: rewritten.next });
  }

  console.log(`moves=${moves.length}`);
  console.log(`updatedMovedFiles=${movedWrites.length}`);
  console.log(`updatedImporters=${importerWrites.length}`);

  if (!APPLY) {
    console.log('dryRun=true (pass --apply to move files and rewrite imports)');
    return;
  }

  for (const item of movedWrites) {
    await fs.mkdir(path.dirname(item.move.to), { recursive: true });
    await fs.writeFile(item.move.to, item.content);
  }

  for (const item of importerWrites) {
    await fs.writeFile(item.filePath, item.content);
  }

  for (const item of movedWrites) {
    await removeIfExists(item.move.from);
    await removeEmptyDirs(path.dirname(item.move.from), SOURCE_ROOT);
  }

  console.log(`movedApplied=${movedWrites.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
