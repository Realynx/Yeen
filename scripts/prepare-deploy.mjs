import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const deployDir = path.resolve('deploy');

const rootPackageJson = JSON.parse(
  await readFile(path.resolve('package.json'), 'utf8'),
);
const serverPackageJson = JSON.parse(
  await readFile(path.resolve('apps/server/package.json'), 'utf8'),
);

const deployDependencies = {
  ...(serverPackageJson.dependencies ?? {}),
};

delete deployDependencies.yeen;
delete deployDependencies['@yeen/shared-contracts'];

const deployPackageJson = {
  name: rootPackageJson.name,
  version: rootPackageJson.version,
  private: true,
  description: rootPackageJson.description,
  main: 'apps/server/dist/main.js',
  scripts: {
    start: 'node apps/server/dist/main.js',
  },
  engines: rootPackageJson.engines,
  dependencies: deployDependencies,
};

async function pathExists(candidatePath) {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

await rm(deployDir, { recursive: true, force: true });
await mkdir(deployDir, { recursive: true });
await mkdir(path.join(deployDir, 'docs'), { recursive: true });

const copyTasks = [
  cp(path.resolve('apps/server/dist'), path.join(deployDir, 'apps/server/dist'), {
    recursive: true,
  }),
  cp(path.resolve('apps/web/dist'), path.join(deployDir, 'apps/web/dist'), {
    recursive: true,
  }),
  cp(path.resolve('deployment'), path.join(deployDir, 'deployment'), {
    recursive: true,
  }),
  cp(path.resolve('apps/server/.env.example'), path.join(deployDir, '.env.example')),
  cp(path.resolve('README.md'), path.join(deployDir, 'README.md')),
  cp(
    path.resolve('docs/docker.md'),
    path.join(deployDir, 'docs/docker.md'),
  ),
  cp(
    path.resolve('docs/github-releases.md'),
    path.join(deployDir, 'docs/github-releases.md'),
  ),
  writeFile(
    path.join(deployDir, 'package.json'),
    `${JSON.stringify(deployPackageJson, null, 2)}\n`,
  ),
  writeFile(
    path.join(deployDir, 'release.json'),
    `${JSON.stringify({
      name: rootPackageJson.name,
      version: rootPackageJson.version,
      preparedAt: new Date().toISOString(),
      dataPolicy: 'remote-production-data-is-authoritative',
    }, null, 2)}\n`,
  ),
  writeFile(
    path.join(deployDir, '.dockerignore'),
    [
      'data',
      '**/data',
      '.env',
      '**/.env',
      '*.sqlite',
      '*.sqlite-*',
      'artifacts',
      'node_modules',
      '**/node_modules',
      '',
    ].join('\n'),
  ),
];

const tvArtifactsSourcePath = path.resolve('artifacts/tv');
if (await pathExists(tvArtifactsSourcePath)) {
  copyTasks.push(
    cp(tvArtifactsSourcePath, path.join(deployDir, 'artifacts/tv'), {
      recursive: true,
    }),
  );
}

await Promise.all(copyTasks);

const bundledAddonArchive = process.env.YEEN_BUNDLED_ADDON_ARCHIVE?.trim();
const bundledAddonMetadata = process.env.YEEN_BUNDLED_ADDON_METADATA?.trim();
if (Boolean(bundledAddonArchive) !== Boolean(bundledAddonMetadata)) {
  throw new Error(
    'Bundled add-on archive and metadata must be provided together.',
  );
}
if (bundledAddonArchive && bundledAddonMetadata) {
  const bundledAddonDirectory = path.join(deployDir, 'deployment', 'addons');
  await mkdir(bundledAddonDirectory, { recursive: true });
  await Promise.all([
    cp(
      path.resolve(bundledAddonArchive),
      path.join(bundledAddonDirectory, 'downloader.yeen-addon.zip'),
    ),
    cp(
      path.resolve(bundledAddonMetadata),
      path.join(bundledAddonDirectory, 'downloader-deploy.json'),
    ),
  ]);
}

const npmCommand = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
const npmPrefixArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : [];
await execFileAsync(
  npmCommand,
  [
    ...npmPrefixArgs,
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--prefix',
    deployDir,
  ],
  { windowsHide: true },
);

const forbiddenEntries = [
  path.join(deployDir, 'data'),
  path.join(deployDir, 'apps/server/data'),
  path.join(deployDir, '.env'),
  path.join(deployDir, 'deployment/docker/.env'),
  path.join(deployDir, 'apps/server/dist/domains/downloader-builtin'),
  path.join(deployDir, 'apps/server/dist/domains/torrent'),
  path.join(
    deployDir,
    'apps/server/dist/domains/media/application/services/torrent-search',
  ),
  path.join(
    deployDir,
    'apps/server/dist/domains/media/application/services/torrent-intake',
  ),
];
for (const forbiddenPath of forbiddenEntries) {
  if (await pathExists(forbiddenPath)) {
    throw new Error(`Deployment artifact contains forbidden state: ${forbiddenPath}`);
  }
}

console.log(`Prepared ${deployDir}`);
