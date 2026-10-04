import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from './atomic-json-file';

export abstract class JsonFileStore<TState> {
  private loaded = false;
  private loading: Promise<void> | undefined;
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

    this.loading ??= this.loadState().finally(() => {
      this.loading = undefined;
    });
    await this.loading;
  }

  private async loadState(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.state = this.defaultState();
      await writeJsonAtomic(this.filePath, this.state);
      this.loaded = true;
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== typeof this.state ||
      Array.isArray(parsed) !== Array.isArray(this.state)
    ) {
      throw new Error(`Unexpected JSON state format: ${this.filePath}`);
    }
    this.state = this.parseLoadedState(parsed);
    this.loaded = true;
  }

  protected async queueSave(): Promise<void> {
    const snapshot = structuredClone(this.state);
    const save = this.saveChain.then(() =>
      writeJsonAtomic(this.filePath, snapshot),
    );
    // Report this failure to its caller, while permitting subsequent saves to retry.
    this.saveChain = save.catch(() => undefined);
    await save;
  }

  protected abstract parseLoadedState(value: unknown): TState;
  protected abstract defaultState(): TState;
}
