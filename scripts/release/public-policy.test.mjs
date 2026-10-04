import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertPublicDirectory, publicFileViolation } from './public-policy.mjs';

test('public source and artifacts reject private implementations and state', () => {
  for (const file of ['private/addon/index.ts', '.private/workflow.md', 'deployment/addons/package.zip',
    'apps/server/data/accounts.json', 'apps/server/.env', '.env.local', 'signing.private.pem',
    'anything.yeen-addon.zip', 'apps/server/dist/domains/torrent/client.js']) {
    assert.ok(publicFileViolation(file), file);
  }
  for (const content of ['YEEN_BUNDLED_ADDON_ARCHIVE', 'com.yeen.downloader', 'qbittorrent', 'magnet:?xt=']) {
    assert.ok(publicFileViolation('scripts/publish.mjs', content));
  }
  for (const file of ['deployment/docker/.env.example', 'packages/addon-sdk/src/index.ts', 'apps/web/.env.production']) {
    assert.equal(publicFileViolation(file, 'generic add-on host'), null);
  }
});

test('artifact scan detects private payloads added after a build', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'yeen-public-'));
  try {
    await writeFile(path.join(root, 'index.js'), 'public core');
    await assertPublicDirectory(root);
    await writeFile(path.join(root, '.env'), 'secret');
    await assert.rejects(assertPublicDirectory(root), /\.env: private/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
