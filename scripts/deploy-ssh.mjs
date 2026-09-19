import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  createRemoteDeployPlan,
  parseDeploySshOptions,
} from './deploy-ssh-config.mjs';
import { prepareBundledAddon } from './deploy-addon-bundle.mjs';

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? process.cwd(),
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      shell: false,
      env: options.env
        ? { ...process.env, ...options.env }
        : process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

function runNpm(args, options = {}) {
  if (process.platform !== 'win32') return run('npm', args, options);
  return run(
    process.env.ComSpec ?? 'cmd.exe',
    ['/d', '/s', '/c', 'npm', ...args],
    options,
  );
}

async function ensureCleanTree(allowDirty) {
  if (allowDirty) return;
  const { stdout } = await run('git', ['status', '--porcelain'], { capture: true });
  if (stdout.trim()) {
    throw new Error('Refusing to deploy a dirty worktree. Commit changes or pass --allow-dirty explicitly.');
  }
}

async function main() {
  const options = parseDeploySshOptions(process.argv.slice(2));
  if (options.rollback) {
    const plan = createRemoteDeployPlan(options);
    await run('ssh', ['-o', 'BatchMode=yes', options.sshTarget, plan.rollbackCommand]);
    return;
  }

  await ensureCleanTree(options.allowDirty);
  const preflightPlan = createRemoteDeployPlan(
    options,
    'preflight-only',
    '0'.repeat(64),
  );
  await run('ssh', [
    '-o',
    'BatchMode=yes',
    options.sshTarget,
    preflightPlan.preflightCommand,
  ]).catch((error) => {
    throw new Error(
      `Remote preflight failed. CT ${options.containerId} must be running and contain an existing Yeen environment plus accounts in ${options.deployRoot}/shared or ${options.legacyRoot}. No files were uploaded.`,
      { cause: error },
    );
  });
  if (!options.skipBuild) {
    const bundledAddon = await prepareBundledAddon(options, run, runNpm);
    console.log(
      `Bundled ${bundledAddon.metadata.id}@${bundledAddon.metadata.version} (${bundledAddon.metadata.digest.slice(0, 12)}).`,
    );
    await runNpm(['run', 'build:zip'], {
      env: bundledAddon.buildEnvironment,
    });
  }

  const archivePath = path.resolve('artifacts/yeen-deploy.zip');
  const archiveBytes = await readFile(archivePath);
  const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
  const releaseId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${sha256.slice(0, 10)}`;
  const plan = createRemoteDeployPlan(options, releaseId, sha256);
  const installerFiles = plan.installerFiles.map((entry) => ({
    ...entry,
    localPath: path.resolve(entry.localPath),
  }));
  await Promise.all([
    stat(archivePath),
    ...installerFiles.map((entry) => stat(entry.localPath)),
  ]);

  console.log(
    `Deploying ${releaseId} through ${options.sshTarget} to Proxmox CT ${options.containerId}.`,
  );
  console.log(
    `Production state remains authoritative at ${options.legacyRoot}/data or ${options.deployRoot}/shared.`,
  );

  try {
    await run('scp', [
      '-o', 'BatchMode=yes', archivePath, `${options.sshTarget}:${plan.archiveOnHost}`,
    ]);
    for (const entry of installerFiles) {
      await run('scp', [
        '-o', 'BatchMode=yes', entry.localPath, `${options.sshTarget}:${entry.hostPath}`,
      ]);
    }
    await run('ssh', [
      '-o',
      'BatchMode=yes',
      options.sshTarget,
      [
        ...plan.prepareAndPushCommands,
        plan.installCommand,
        plan.verifyReleaseCommand,
      ].join(' && '),
    ]);
  } finally {
    await run('ssh', [
      '-o',
      'BatchMode=yes',
      options.sshTarget,
      `${plan.hostCleanupCommand}; ${plan.containerCleanupCommand}`,
    ]).catch(() => undefined);
  }

  console.log(`Deployment ${releaseId} completed successfully.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
