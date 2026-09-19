import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddonSettingsStore } from './addon-settings';

describe('AddonSettingsStore legacy migration', () => {
  const originalDirectory = process.cwd();
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yeen-addon-settings-'));
    process.chdir(directory);
  });

  afterEach(async () => {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  });

  it('imports selected legacy values once and keeps newer add-on values', async () => {
    const dataDirectory = join(directory, 'data');
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(
      join(dataDirectory, 'system-settings.json'),
      JSON.stringify({ secret: 'legacy', unrelated: 'do not copy' }),
      'utf8',
    );
    const store = new AddonSettingsStore();
    await store.replace('example', { secret: 'new' });

    await expect(
      store.migrateLegacy('example', {
        migrationId: 'settings-v1',
        fields: ['secret'],
      }),
    ).resolves.toEqual({ secret: 'new' });

    await store.replace('example', {});
    await expect(
      store.migrateLegacy('example', {
        migrationId: 'settings-v1',
        fields: ['secret'],
      }),
    ).resolves.toEqual({});

    const persisted = JSON.parse(
      await readFile(join(dataDirectory, 'addon-settings.json'), 'utf8'),
    ) as { completedMigrations: string[] };
    expect(persisted.completedMigrations).toEqual(['example:settings-v1']);
    await expect(
      readFile(join(dataDirectory, 'system-settings.json'), 'utf8').then(
        JSON.parse,
      ),
    ).resolves.toEqual({ unrelated: 'do not copy' });
  });
});
