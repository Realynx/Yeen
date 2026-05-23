import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = Number.parseInt(process.env.LINE_BUDGET_MAX ?? '400', 10);
const BORDERLINE_MIN = Number.parseInt(
  process.env.LINE_BUDGET_BORDERLINE_MIN ?? '350',
  10,
);
const hardMode =
  process.argv.includes('--hard') || process.env.LINE_BUDGET_HARD === '1';

const includeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const scopedRoots = [
  'apps/server/src',
  'apps/server/test',
  'apps/web/src',
  'apps/web/test',
];

const skippedDirectoryNames = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  '.cache',
]);

const allowlistFileName = '.line-budget-allowlist.json';

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function collectFiles(rootPath, bucket) {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith('.')) {
        return;
      }

      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirectoryNames.has(entry.name)) {
          return;
        }

        await collectFiles(fullPath, bucket);
        return;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (includeExtensions.has(extension)) {
        bucket.push(fullPath);
      }
    }),
  );
}

async function countLines(filePath) {
  const raw = await readFile(filePath, 'utf8');
  if (!raw) {
    return 0;
  }

  return raw.split(/\r?\n/).length;
}

function parseAllowlistDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function loadAllowlist(repoRoot) {
  const allowlistPath = path.join(repoRoot, allowlistFileName);

  try {
    const raw = await readFile(allowlistPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return { activeByPath: new Map(), expired: [], invalid: [] };
    }

    const activeByPath = new Map();
    const expired = [];
    const invalid = [];
    const now = new Date();

    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        invalid.push({ reason: 'Entry is not an object.' });
        continue;
      }

      const scopedPath =
        typeof entry.path === 'string' ? entry.path.trim().replace(/^\/+/, '') : '';
      const owner = typeof entry.owner === 'string' ? entry.owner.trim() : '';
      const expiresOnRaw =
        typeof entry.expiresOn === 'string' ? entry.expiresOn.trim() : '';

      if (!scopedPath || !owner || !expiresOnRaw) {
        invalid.push({
          path: scopedPath || '(missing path)',
          reason: 'path, owner, and expiresOn are required.',
        });
        continue;
      }

      const expiresOn = parseAllowlistDate(expiresOnRaw);
      if (!expiresOn) {
        invalid.push({
          path: scopedPath,
          reason: `Invalid expiresOn value: ${expiresOnRaw}`,
        });
        continue;
      }

      const normalizedPath = scopedPath.split('\\').join('/');
      if (expiresOn.getTime() < now.getTime()) {
        expired.push({
          path: normalizedPath,
          owner,
          expiresOn: expiresOnRaw,
          reason: typeof entry.reason === 'string' ? entry.reason : '',
        });
        continue;
      }

      activeByPath.set(normalizedPath, {
        owner,
        expiresOn: expiresOnRaw,
        reason: typeof entry.reason === 'string' ? entry.reason : '',
      });
    }

    return { activeByPath, expired, invalid };
  } catch {
    return { activeByPath: new Map(), expired: [], invalid: [] };
  }
}

function printRows(rows) {
  if (rows.length === 0) {
    return;
  }

  const longestPath = Math.max(...rows.map((row) => row.path.length), 20);
  console.log(
    `  ${'Lines'.padStart(6)}  ${'Path'.padEnd(longestPath)}  Allowlist`,
  );
  for (const row of rows) {
    console.log(
      `  ${String(row.lines).padStart(6)}  ${row.path.padEnd(longestPath)}  ${row.allowlist}`,
    );
  }
}

async function main() {
  const repoRoot = process.cwd();
  const files = [];

  for (const scopedRoot of scopedRoots) {
    await collectFiles(path.join(repoRoot, scopedRoot), files);
  }

  const allowlist = await loadAllowlist(repoRoot);

  const measured = await Promise.all(
    files.map(async (absolutePath) => {
      const lines = await countLines(absolutePath);
      const relativePath = toPosix(path.relative(repoRoot, absolutePath));
      const allowlistEntry = allowlist.activeByPath.get(relativePath) ?? null;

      return {
        path: relativePath,
        lines,
        allowlistEntry,
      };
    }),
  );

  const violations = measured
    .filter((entry) => entry.lines > MAX_LINES)
    .sort((left, right) => right.lines - left.lines);

  const borderline = measured
    .filter((entry) => entry.lines >= BORDERLINE_MIN && entry.lines <= MAX_LINES)
    .sort((left, right) => right.lines - left.lines);

  const allowlistedViolations = violations.filter((entry) => entry.allowlistEntry);
  const unallowlistedViolations = violations.filter((entry) => !entry.allowlistEntry);

  console.log('Line budget check');
  console.log(`  Scope roots: ${scopedRoots.join(', ')}`);
  console.log(`  Budget: <= ${MAX_LINES} lines`);
  console.log(`  Mode: ${hardMode ? 'hard-fail' : 'soft-warn'}`);
  console.log(`  Files scanned: ${measured.length}`);

  if (violations.length === 0) {
    console.log('  Result: No files over budget.');
  } else {
    console.log(`  Result: ${violations.length} file(s) over budget.`);

    if (unallowlistedViolations.length > 0) {
      console.log('\nOver budget (not allowlisted):');
      printRows(
        unallowlistedViolations.map((entry) => ({
          path: entry.path,
          lines: entry.lines,
          allowlist: 'no',
        })),
      );
    }

    if (allowlistedViolations.length > 0) {
      console.log('\nOver budget (temporary allowlist):');
      printRows(
        allowlistedViolations.map((entry) => ({
          path: entry.path,
          lines: entry.lines,
          allowlist: `${entry.allowlistEntry.owner} until ${entry.allowlistEntry.expiresOn}`,
        })),
      );
    }
  }

  if (borderline.length > 0) {
    console.log(`\nBorderline (${BORDERLINE_MIN}-${MAX_LINES} lines):`);
    printRows(
      borderline.map((entry) => ({
        path: entry.path,
        lines: entry.lines,
        allowlist: entry.allowlistEntry
          ? `${entry.allowlistEntry.owner} until ${entry.allowlistEntry.expiresOn}`
          : 'n/a',
      })),
    );
  }

  if (allowlist.expired.length > 0) {
    console.log('\nExpired allowlist entries:');
    for (const entry of allowlist.expired) {
      console.log(
        `  - ${entry.path} (owner: ${entry.owner}, expired: ${entry.expiresOn})`,
      );
    }
  }

  if (allowlist.invalid.length > 0) {
    console.log('\nInvalid allowlist entries:');
    for (const entry of allowlist.invalid) {
      console.log(`  - ${entry.path ?? '(unknown)'}: ${entry.reason}`);
    }
  }

  if (hardMode && unallowlistedViolations.length > 0) {
    process.exitCode = 1;
    console.error(
      `\nLine budget hard-fail: ${unallowlistedViolations.length} file(s) exceed ${MAX_LINES} lines without active allowlist entries.`,
    );
    return;
  }

  if (!hardMode && unallowlistedViolations.length > 0) {
    console.warn(
      `\nLine budget warning: ${unallowlistedViolations.length} file(s) exceed ${MAX_LINES} lines.`,
    );
  }
}

await main();
