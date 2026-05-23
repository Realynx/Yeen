import fs from 'node:fs/promises';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const GROUPS = [
  {
    name: 'web-features',
    wrapperRoot: path.resolve('apps/web/src/features'),
    sourceRoot: path.resolve('apps/web/src'),
    excludeSegment: `${path.sep}features${path.sep}`,
  },
  {
    name: 'server-domains',
    wrapperRoot: path.resolve('apps/server/src/domains'),
    sourceRoot: path.resolve('apps/server/src'),
    excludeSegment: `${path.sep}domains${path.sep}`,
  },
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function toPosix(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function withDotPrefix(inputPath) {
  return inputPath.startsWith('.') ? inputPath : `./${inputPath}`;
}

function stripSourceExtension(inputPath) {
  return inputPath.replace(/\.(ts|tsx|mts|cts)$/i, '');
}

function parseWrapperTarget(sourceText) {
  const trimmed = sourceText.trim();
  const match = trimmed.match(/^export\s+\*\s+from\s+['"](.+)['"];?$/);
  return match ? match[1] : null;
}

function hasDefaultExport(sourceText) {
  return /\bexport\s+default\b/.test(sourceText);
}

function rewriteSpecifier(specifier, fromFile, toFile) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  const fromDir = path.dirname(fromFile);
  const toDir = path.dirname(toFile);
  const absoluteTarget = path.resolve(fromDir, specifier);
  let rewritten = path.relative(toDir, absoluteTarget);
  rewritten = toPosix(rewritten);

  return withDotPrefix(rewritten || '.');
}

function rewriteRelativeSpecifiers(sourceText, fromFile, toFile) {
  let rewritten = sourceText;

  const fromPattern = /(\bfrom\s*['"])([^'"]+)(['"])/g;
  const dynamicImportPattern = /(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;
  const requirePattern = /(\brequire\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;
  const sideEffectImportPattern = /(^|[\r\n;]\s*)(import\s+['"])([^'"]+)(['"])/gm;

  rewritten = rewritten.replace(fromPattern, (full, prefix, specifier, suffix) => {
    return `${prefix}${rewriteSpecifier(specifier, fromFile, toFile)}${suffix}`;
  });

  rewritten = rewritten.replace(dynamicImportPattern, (full, prefix, specifier, suffix) => {
    return `${prefix}${rewriteSpecifier(specifier, fromFile, toFile)}${suffix}`;
  });

  rewritten = rewritten.replace(requirePattern, (full, prefix, specifier, suffix) => {
    return `${prefix}${rewriteSpecifier(specifier, fromFile, toFile)}${suffix}`;
  });

  rewritten = rewritten.replace(
    sideEffectImportPattern,
    (full, preface, keyword, specifier, suffix) => {
      return `${preface}${keyword}${rewriteSpecifier(specifier, fromFile, toFile)}${suffix}`;
    },
  );

  return rewritten;
}

async function walkFiles(rootDir) {
  const results = [];
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

      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      results.push(fullPath);
    }
  }

  return results;
}

async function existsFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveSourceFile(basePath) {
  const candidates = [];
  const ext = path.extname(basePath).toLowerCase();

  if (SOURCE_EXTENSIONS.has(ext)) {
    candidates.push(basePath);
  } else {
    candidates.push(basePath);
    for (const sourceExt of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}${sourceExt}`);
      candidates.push(path.join(basePath, `index${sourceExt}`));
    }
  }

  for (const candidate of candidates) {
    if (await existsFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function buildShimContent(relativeTarget, sourceText) {
  const eol = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const exportAll = `export * from '${relativeTarget}';`;
  if (!hasDefaultExport(sourceText)) {
    return `${exportAll}${eol}`;
  }
  const exportDefault = `export { default } from '${relativeTarget}';`;
  return `${exportAll}${eol}${exportDefault}${eol}`;
}

async function collectMappings(group) {
  const wrapperFiles = await walkFiles(group.wrapperRoot);
  const seenTargets = new Map();
  const mappings = [];
  let skippedParse = 0;
  let skippedMissingTarget = 0;
  let skippedNonFile = 0;
  let skippedOutsideRoot = 0;
  let skippedAlreadyGrouped = 0;

  for (const wrapperFile of wrapperFiles) {
    const rawWrapper = await fs.readFile(wrapperFile, 'utf8');
    const targetRel = parseWrapperTarget(rawWrapper);
    if (!targetRel) {
      skippedParse += 1;
      continue;
    }

    const unresolvedTarget = path.resolve(path.dirname(wrapperFile), targetRel);
    const targetFile = await resolveSourceFile(unresolvedTarget);
    if (!targetFile) {
      skippedMissingTarget += 1;
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(targetFile))) {
      skippedNonFile += 1;
      continue;
    }

    if (!targetFile.startsWith(group.sourceRoot)) {
      skippedOutsideRoot += 1;
      continue;
    }

    if (targetFile.includes(group.excludeSegment)) {
      skippedAlreadyGrouped += 1;
      continue;
    }

    if (path.resolve(targetFile) === path.resolve(wrapperFile)) {
      skippedAlreadyGrouped += 1;
      continue;
    }

    if (seenTargets.has(targetFile)) {
      continue;
    }

    seenTargets.set(targetFile, wrapperFile);
    mappings.push({ group: group.name, wrapperFile, targetFile });
  }

  return {
    mappings,
    stats: {
      wrappersScanned: wrapperFiles.length,
      skippedParse,
      skippedMissingTarget,
      skippedNonFile,
      skippedOutsideRoot,
      skippedAlreadyGrouped,
    },
  };
}

async function applyMappings(allMappings) {
  let movedCount = 0;
  for (const mapping of allMappings) {
    const sourceText = await fs.readFile(mapping.targetFile, 'utf8');
    const movedText = rewriteRelativeSpecifiers(
      sourceText,
      mapping.targetFile,
      mapping.wrapperFile,
    );

    const backCompatRelative = withDotPrefix(
      stripSourceExtension(
        toPosix(path.relative(path.dirname(mapping.targetFile), mapping.wrapperFile)),
      ),
    );

    const shimText = buildShimContent(backCompatRelative, sourceText);

    await fs.writeFile(mapping.wrapperFile, movedText);
    await fs.writeFile(mapping.targetFile, shimText);

    movedCount += 1;

    if (VERBOSE && movedCount <= 50) {
      console.log(
        `moved: ${path.relative(process.cwd(), mapping.targetFile)} -> ${path.relative(process.cwd(), mapping.wrapperFile)}`,
      );
    }
  }

  return movedCount;
}

async function main() {
  let allMappings = [];
  const groupSummaries = [];

  for (const group of GROUPS) {
    const result = await collectMappings(group);
    allMappings = allMappings.concat(result.mappings);
    groupSummaries.push({ name: group.name, ...result.stats, mapped: result.mappings.length });
  }

  groupSummaries.forEach((summary) => {
    console.log(`group=${summary.name}`);
    console.log(`  wrappersScanned=${summary.wrappersScanned}`);
    console.log(`  mapped=${summary.mapped}`);
    console.log(`  skippedParse=${summary.skippedParse}`);
    console.log(`  skippedMissingTarget=${summary.skippedMissingTarget}`);
    console.log(`  skippedNonFile=${summary.skippedNonFile}`);
    console.log(`  skippedOutsideRoot=${summary.skippedOutsideRoot}`);
    console.log(`  skippedAlreadyGrouped=${summary.skippedAlreadyGrouped}`);
  });

  console.log(`totalMappings=${allMappings.length}`);

  if (!APPLY) {
    console.log('dryRun=true (pass --apply to migrate files)');
    return;
  }

  const movedCount = await applyMappings(allMappings);
  console.log(`movedCount=${movedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
