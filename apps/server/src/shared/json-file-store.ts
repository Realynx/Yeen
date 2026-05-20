import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export abstract class JsonFileStore<TState> {
  private loaded = false;
  private saveChain: Promise<void> = Promise.resolve();
  protected state: TState;

  protected constructor(
    private readonly filePath: string,
    initialState: TState,
  ) {
    this.state = initialState;
  }

  protected async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      this.state = this.parseLoadedState(parsed);
    } catch {
      this.state = this.defaultState();
      await this.writeCurrentState();
    }

    this.loaded = true;
  }

  protected async queueSave(): Promise<void> {
    this.saveChain = this.saveChain.then(async () => {
      await this.writeCurrentState();
    });

    await this.saveChain;
  }

  protected abstract parseLoadedState(value: unknown): TState;
  protected abstract defaultState(): TState;

  private async writeCurrentState(): Promise<void> {
    await writeFile(
      this.filePath,
      `${JSON.stringify(this.state, null, 2)}\n`,
      'utf8',
    );
  }
}
