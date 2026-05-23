import fs from 'node:fs/promises';
import path from 'node:path';

const ROOTS = [
  path.resolve('apps/web/src'),
  path.resolve('apps/server/src'),
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

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
      if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function isShimLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return (
    /^export\s+\*\s+from\s+['"][^'"]+['"];?$/.test(trimmed) ||
    /^export\s+\{\s*default\s*\}\s+from\s+['"][^'"]+['"];?$/.test(trimmed)
  );
}

function isShimFile(content) {
  const lines = content.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0 || lines.length > 3) {
    return false;
  }
  return lines.every(isShimLine);
}

function stripTsExtensionsInShim(content) {
  return content.replace(
    /((?:export\s+\*\s+from|export\s+\{\s*default\s*\}\s+from)\s+['"][^'"]+?)\.(?:ts|tsx|mts|cts)(['"]\s*;?)/g,
    '$1$2',
  );
}

async function main() {
  let scanned = 0;
  let shimFiles = 0;
  let updated = 0;

  for (const root of ROOTS) {
    const files = await walkFiles(root);
    for (const filePath of files) {
      scanned += 1;
      const content = await fs.readFile(filePath, 'utf8');
      if (!isShimFile(content)) {
        continue;
      }

      shimFiles += 1;
      const next = stripTsExtensionsInShim(content);
      if (next === content) {
        continue;
      }

      await fs.writeFile(filePath, next);
      updated += 1;
    }
  }

  console.log(`scanned=${scanned}`);
  console.log(`shimFiles=${shimFiles}`);
  console.log(`updated=${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
