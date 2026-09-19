import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeReleaseTag,
  prepareGithubRelease,
} from './prepare-github-release.mjs';

test('release tag must exactly match package version', () => {
  assert.equal(normalizeReleaseTag('v1.2.3', '1.2.3'), 'v1.2.3');
  assert.throws(
    () => normalizeReleaseTag('v1.2.4', '1.2.3'),
    /does not match package version/,
  );
});

test('release assets include a verifiable archive, checksum, and metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'yeen-release-test-'));
  try {
    await mkdir(path.join(root, 'artifacts'));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'yeen', version: '1.2.3' }),
    );
    await writeFile(path.join(root, 'artifacts', 'yeen-deploy.zip'), 'archive');

    const result = await prepareGithubRelease({
      repositoryRoot: root,
      tag: 'v1.2.3',
      commit: '0123456789abcdef0123456789abcdef01234567',
      builtAt: '2026-07-19T00:00:00.000Z',
    });
    const checksum = await readFile(
      path.join(root, 'artifacts', result.checksumName),
      'utf8',
    );

    assert.match(checksum, /^[a-f0-9]{64} {2}yeen-v1\.2\.3\.zip\n$/);
    assert.equal(result.metadata.archive.file, 'yeen-v1.2.3.zip');
    assert.equal(
      result.metadata.dataPolicy,
      'runtime-data-and-environment-are-never-packaged',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
