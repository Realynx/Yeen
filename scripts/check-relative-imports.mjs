import fs from 'node:fs/promises';
import path from 'node:path';

const ROOTS = [path.resolve('apps/web/src'), path.resolve('apps/server/src')];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

async function walk(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      files.push(fullPath);
    }
  }
  return files;
}

function collectSpecifiers(content) {
  const specs = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(^|[\r\n;]\s*)import\s+['"]([^'"]+)['"]/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const spec = match[1] ?? match[2];
      if (spec) specs.push(spec);
    }
  }

  return specs;
}

async function exists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolves(fromFile, specifier) {
  if (!specifier.startsWith('.')) return true;

  const base = path.resolve(path.dirname(fromFile), specifier);
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
    if (await exists(candidate)) {
      return true;
    }
  }

  return false;
}

async function main() {
  const missing = [];

  for (const root of ROOTS) {
    const files = await walk(root);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const specs = collectSpecifiers(content);
      for (const specifier of specs) {
        if (!specifier.startsWith('.')) continue;
        const ok = await resolves(file, specifier);
        if (!ok) {
          missing.push({ file, specifier });
        }
      }
    }
  }

  console.log(`missingCount=${missing.length}`);
  for (const item of missing.slice(0, 200)) {
    console.log(`${path.relative(process.cwd(), item.file)} :: ${item.specifier}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
