import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStore } from './json-file-store';
import { writeJsonAtomic } from './atomic-json-file';

class TestStore extends JsonFileStore<string[]> {
  constructor(file: string) {
    super(file, []);
  }
  async list() {
    await this.ensureLoaded();
    return [...this.state];
  }
  async add(value: string) {
    await this.ensureLoaded();
    this.state.push(value);
    await this.queueSave();
  }
  protected defaultState() {
    return [];
  }
  protected parseLoadedState(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === 'string')
    ) {
      throw new Error('Invalid state');
    }
    return value;
  }
}

describe('persistent JSON documents', () => {
  let root: string;
  let file: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yeen-store-'));
    file = join(root, 'state.json');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each(['{broken', '{"unexpected":"shape"}'])(
    'preserves invalid state %s and permits repair',
    async (contents) => {
      await writeFile(file, contents);
      const store = new TestStore(file);
      await expect(store.list()).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe(contents);
      await writeFile(file, '["restored"]');
      expect(await store.list()).toEqual(['restored']);
    },
  );

  it('coordinates concurrent first loads without losing changes', async () => {
    const store = new TestStore(file);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.add(String(i))),
    );
    expect(await new TestStore(file).list()).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i)),
    );
  });

  it('reports read failures without attempting initialization', async () => {
    await mkdir(file);
    await expect(new TestStore(file).list()).rejects.toThrow();
    expect((await stat(file)).isDirectory()).toBe(true);
  });

  it('recovers its write queue after a failed replacement', async () => {
    const store = new TestStore(file);
    await store.add('first');
    await rename(file, `${file}.backup`);
    await mkdir(file);
    await expect(store.add('retry')).rejects.toThrow();
    expect(await readFile(`${file}.backup`, 'utf8')).toContain('first');
    expect(
      (await readdir(root)).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
    await rm(file, { recursive: true });
    await store.add('last');
    expect(await new TestStore(file).list()).toEqual([
      'first',
      'retry',
      'last',
    ]);
  });

  it('leaves the old document intact when serialization fails', async () => {
    await writeJsonAtomic(file, ['saved']);
    await expect(
      writeJsonAtomic(file, { invalid: BigInt(1) }),
    ).rejects.toThrow();
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['saved']);
    if (process.platform !== 'win32')
      expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});
