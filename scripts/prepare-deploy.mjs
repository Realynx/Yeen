import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

await rm(deployDir, { recursive: true, force: true });
await mkdir(path.join(deployDir, 'apps/server/data'), { recursive: true });

await Promise.all([
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
  writeFile(
    path.join(deployDir, 'package.json'),
    `${JSON.stringify(deployPackageJson, null, 2)}\n`,
  ),
]);

console.log(`Prepared ${deployDir}`);