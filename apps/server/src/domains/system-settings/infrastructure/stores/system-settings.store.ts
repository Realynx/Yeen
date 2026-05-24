import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';
import { SystemSettings } from '../../domain/entities/system-settings.entity';

@Injectable()
export class SystemSettingsStore extends JsonFileStore<
  Partial<SystemSettings>
> {
  constructor() {
    super(join(process.cwd(), 'data', 'system-settings.json'), {});
  }

  async get(): Promise<Partial<SystemSettings>> {
    await this.ensureLoaded();
    return { ...this.state };
  }

  async replace(nextSettings: SystemSettings): Promise<void> {
    await this.ensureLoaded();
    this.state = { ...nextSettings };
    await this.queueSave();
  }

  protected parseLoadedState(value: unknown): Partial<SystemSettings> {
    return this.isObject(value) ? value : {};
  }

  protected defaultState(): Partial<SystemSettings> {
    return {};
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
