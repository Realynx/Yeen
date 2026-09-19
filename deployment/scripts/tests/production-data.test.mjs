import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const serverRoot = path.join(repositoryRoot, 'apps', 'server');
const runtimeRequire = (() => {
  for (const packageRoot of [repositoryRoot, serverRoot]) {
    const candidate = createRequire(path.join(packageRoot, 'package.json'));
    try {
      candidate.resolve('better-sqlite3');
      return candidate;
    } catch {
      // Development installs and packaged releases place dependencies differently.
    }
  }
  throw new Error('Unable to resolve better-sqlite3 for production data tests.');
})();
const Database = runtimeRequire('better-sqlite3');
const runtimeNodeModules = path.dirname(
  path.dirname(runtimeRequire.resolve('better-sqlite3/package.json')),
);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'yeen-production-data-'));
  const releaseRoot = path.join(root, 'release');
  const scriptDir = path.join(releaseRoot, 'deployment', 'scripts');
  const dataDir = path.join(root, 'shared', 'data');
  const backupDir = path.join(root, 'shared', 'backups', 'attempt');
  await mkdir(scriptDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await copyFile(
    path.join(repositoryRoot, 'deployment', 'scripts', 'production-data.mjs'),
    path.join(scriptDir, 'production-data.mjs'),
  );
  await symlink(
    runtimeNodeModules,
    path.join(releaseRoot, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await writeFile(path.join(dataDir, 'accounts.json'), '[{"id":"before"}]\n');
  await writeFile(path.join(dataDir, 'system-settings.json'), '{}\n');
  const sqlitePath = path.join(dataDir, 'media-metadata.sqlite');
  const database = new Database(sqlitePath);
  database.exec('CREATE TABLE state (value TEXT NOT NULL); INSERT INTO state VALUES (\'before\')');
  database.close();
  return {
    root,
    dataDir,
    backupDir,
    sqlitePath,
    script: path.join(scriptDir, 'production-data.mjs'),
  };
}

async function run(script, ...args) {
  return execFileAsync(process.execPath, [script, ...args], { windowsHide: true });
}

test('restore replaces JSON and SQLite while quarantining failed mutations', async () => {
  const state = await fixture();
  try {
    await run(state.script, 'backup', state.dataDir, state.backupDir);
    await writeFile(path.join(state.dataDir, 'accounts.json'), '[{"id":"after"}]\n');
    await writeFile(path.join(state.dataDir, 'failed-only.json'), '{"failed":true}\n');
    const database = new Database(state.sqlitePath);
    database.prepare('UPDATE state SET value = ?').run('after');
    database.close();

    await run(state.script, 'restore', state.dataDir, state.backupDir);

    assert.deepEqual(
      JSON.parse(await readFile(path.join(state.dataDir, 'accounts.json'), 'utf8')),
      [{ id: 'before' }],
    );
    await assert.rejects(readFile(path.join(state.dataDir, 'failed-only.json')));
    const restored = new Database(state.sqlitePath, { readonly: true });
    assert.equal(restored.prepare('SELECT value FROM state').pluck().get(), 'before');
    restored.close();
    const backupEntries = await readdir(state.backupDir);
    const quarantine = backupEntries.find((entry) => entry.startsWith('failed-runtime-'));
    assert.ok(quarantine);
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(state.backupDir, quarantine, 'failed-only.json'), 'utf8'),
      ),
      { failed: true },
    );
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('restore rejects a manifest whose authoritative target was changed', async () => {
  const state = await fixture();
  try {
    await run(state.script, 'backup', state.dataDir, state.backupDir);
    const manifestPath = path.join(state.backupDir, 'backup-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.sourceDataDir = path.join(state.root, 'outside');
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(run(state.script, 'restore', state.dataDir, state.backupDir));
    assert.deepEqual(
      JSON.parse(await readFile(path.join(state.dataDir, 'accounts.json'), 'utf8')),
      [{ id: 'before' }],
    );
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});
