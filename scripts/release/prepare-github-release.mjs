import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const COMMIT_PATTERN = /^[a-f0-9]{7,64}$/i;

export function normalizeReleaseTag(value, packageVersion) {
  const match = VERSION_PATTERN.exec(value?.trim() ?? '');
  if (!match) {
    throw new Error('Release tag must use vMAJOR.MINOR.PATCH syntax.');
  }

  if (match[1] !== packageVersion) {
    throw new Error(
      `Release tag v${match[1]} does not match package version ${packageVersion}.`,
    );
  }

  return `v${match[1]}`;
}

export async function prepareGithubRelease({
  repositoryRoot,
  tag,
  commit,
  builtAt = new Date().toISOString(),
}) {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const normalizedTag = normalizeReleaseTag(tag, packageJson.version);
  const normalizedCommit = commit?.trim() ?? '';
  if (!COMMIT_PATTERN.test(normalizedCommit)) {
    throw new Error('Release commit must be a 7-64 character Git SHA.');
  }

  const artifactsDirectory = path.join(repositoryRoot, 'artifacts');
  const sourceArchive = path.join(artifactsDirectory, `${packageJson.name}-deploy.zip`);
  const sourceStats = await stat(sourceArchive);
  if (!sourceStats.isFile() || sourceStats.size === 0) {
    throw new Error('Deployment archive is missing or empty.');
  }

  const archiveName = `${packageJson.name}-${normalizedTag}.zip`;
  const archivePath = path.join(artifactsDirectory, archiveName);
  await mkdir(artifactsDirectory, { recursive: true });
  await copyFile(sourceArchive, archivePath);
  const archiveBytes = await readFile(archivePath);
  const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
  const checksumName = `${archiveName}.sha256`;
  const metadataName = `${packageJson.name}-${normalizedTag}.release.json`;
  const metadata = {
    schemaVersion: 1,
    product: packageJson.name,
    version: packageJson.version,
    tag: normalizedTag,
    commit: normalizedCommit.toLowerCase(),
    builtAt,
    archive: {
      file: archiveName,
      bytes: archiveBytes.byteLength,
      sha256,
    },
    dataPolicy: 'runtime-data-and-environment-are-never-packaged',
  };

  await Promise.all([
    writeFile(
      path.join(artifactsDirectory, checksumName),
      `${sha256}  ${archiveName}\n`,
      'utf8',
    ),
    writeFile(
      path.join(artifactsDirectory, metadataName),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    ),
  ]);

  return { archiveName, checksumName, metadataName, metadata };
}

async function main() {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf('--tag');
  const commitIndex = args.indexOf('--commit');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : process.env.GITHUB_REF_NAME;
  const commit = commitIndex >= 0 ? args[commitIndex + 1] : process.env.GITHUB_SHA;
  const result = await prepareGithubRelease({
    repositoryRoot: path.resolve('.'),
    tag,
    commit,
    builtAt: process.env.SOURCE_DATE_EPOCH
      ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
      : new Date().toISOString(),
  });
  console.log(
    `Prepared ${result.archiveName}, ${result.checksumName}, and ${result.metadataName}.`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (invokedPath === import.meta.url) {
  await main();
}
