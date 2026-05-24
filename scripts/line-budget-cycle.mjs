import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_INTERVAL_MS = Number.parseInt(
  process.env.LINE_BUDGET_CYCLE_MS ?? '5000',
  10,
);
const maxCycles = parseMaxCycles(process.argv);
const intervalMs =
  Number.isFinite(DEFAULT_INTERVAL_MS) && DEFAULT_INTERVAL_MS >= 0
    ? DEFAULT_INTERVAL_MS
    : 5000;

const repoRoot = process.cwd();
const checkerScriptPath = path.join(repoRoot, 'scripts', 'check-line-budget.mjs');

async function runScan() {
  const { stdout } = await execFileAsync(process.execPath, [
    checkerScriptPath,
    '--json',
  ]);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Line budget checker returned no JSON output.');
  }

  return JSON.parse(trimmed);
}

async function main() {
  let cycle = 0;

  while (true) {
    cycle += 1;
    const report = await runScan();
    const remaining = report?.summary?.unallowlistedViolations ?? 0;
    const total = report?.summary?.totalViolations ?? 0;
    const filesScanned = report?.summary?.filesScanned ?? 0;
    const roots = Array.isArray(report?.config?.scopedRoots)
      ? report.config.scopedRoots.join(', ')
      : '(unknown roots)';

    console.log(
      `[cycle ${cycle}] scanned=${filesScanned} roots=[${roots}] overBudget=${remaining}/${total}`,
    );

    if (remaining <= 0) {
      console.log(
        `[cycle ${cycle}] clean: no source files are above ${report?.config?.maxLines ?? 400} lines.`,
      );
      return;
    }

    const topFive = Array.isArray(report?.violations?.unallowlisted)
      ? report.violations.unallowlisted.slice(0, 5)
      : [];

    if (topFive.length > 0) {
      console.log('[cycle] top over-budget files:');
      for (const entry of topFive) {
        console.log(`  - ${entry.path} (${entry.lines} lines)`);
      }
    }

    if (maxCycles !== null && cycle >= maxCycles) {
      console.warn(
        `[cycle ${cycle}] reached max cycles (${maxCycles}) with ${remaining} file(s) still over budget.`,
      );
      process.exitCode = 1;
      return;
    }

    if (intervalMs > 0) {
      await delay(intervalMs);
    }
  }
}

function parseMaxCycles(argv) {
  const flag = argv.find((arg) => arg.startsWith('--max-cycles='));
  if (!flag) {
    return null;
  }

  const value = Number.parseInt(flag.split('=')[1] ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('--max-cycles must be a positive integer.');
  }

  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
