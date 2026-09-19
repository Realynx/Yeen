import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const addonRoot = resolve(repositoryRoot, 'private/yeen-downloader-addon');

if (!existsSync(addonRoot)) {
  console.log('Private Downloader Add-on is absent; optional quality checks skipped.');
  process.exit(0);
}

runNodeTool('node_modules/eslint/bin/eslint.js', [
  'private/yeen-downloader-addon/src',
  'private/yeen-downloader-addon/scripts',
  '--max-warnings=0',
]);

if (process.argv.includes('--full')) {
  runNpm(['--prefix', addonRoot, 'run', 'server:typecheck']);
  runNpm(['--prefix', addonRoot, 'run', 'test:server']);
  runNpm(['--prefix', addonRoot, 'run', 'test:web']);
}

function runNodeTool(relativeToolPath, args) {
  const result = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, relativeToolPath), ...args],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );
  exitOnFailure(result, relativeToolPath);
}

function runNpm(args) {
  const npmCli =
    process.env.npm_execpath ??
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  exitOnFailure(result, `npm ${args.join(' ')}`);
}

function exitOnFailure(result, label) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
    process.exit(result.status ?? 1);
  }
}
