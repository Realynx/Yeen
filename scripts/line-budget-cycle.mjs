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

function summarizeReport(report) {
  const summary = report?.summary ?? {};
  const config = report?.config ?? {};
  const violations = report?.violations ?? {};
  return {
    remaining: summary.unallowlistedViolations ?? 0,
    total: summary.totalViolations ?? 0,
    filesScanned: summary.filesScanned ?? 0,
    roots: Array.isArray(config.scopedRoots)
      ? config.scopedRoots.join(', ')
      : '(unknown roots)',
    maxLines: config.maxLines ?? 400,
    topFive: Array.isArray(violations.unallowlisted)
      ? violations.unallowlisted.slice(0, 5)
      : [],
  };
}

function printCycleReport(cycle, summary) {
  console.log(
    `[cycle ${cycle}] scanned=${summary.filesScanned} roots=[${summary.roots}] overBudget=${summary.remaining}/${summary.total}`,
  );
  if (summary.topFive.length === 0) return;
  console.log('[cycle] top over-budget files:');
  for (const entry of summary.topFive) {
    console.log(`  - ${entry.path} (${entry.lines} lines)`);
  }
}

async function main() {
  let cycle = 0;

  while (true) {
    cycle += 1;
    const report = await runScan();
    const summary = summarizeReport(report);
    printCycleReport(cycle, summary);

    if (summary.remaining <= 0) {
      console.log(
        `[cycle ${cycle}] clean: no source files are above ${summary.maxLines} lines.`,
      );
      return;
    }

    if (maxCycles !== null && cycle >= maxCycles) {
      console.warn(
        `[cycle ${cycle}] reached max cycles (${maxCycles}) with ${summary.remaining} file(s) still over budget.`,
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
