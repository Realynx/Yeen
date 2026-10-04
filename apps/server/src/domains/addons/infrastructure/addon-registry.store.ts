import { writeJsonAtomic } from '../../core/infrastructure/shared/atomic-json-file';
import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  AddonRecord,
  AddonRegistryState,
  InstalledAddonPackage,
} from '../domain/addon-package.types';

const DEFAULT_STATE: AddonRegistryState = {
  schemaVersion: 1,
  allowUnsigned: false,
  restartRequired: false,
  addons: {},
};

@Injectable()
export class AddonRegistryStore implements OnModuleInit {
  private readonly rootPath: string;
  private readonly registryPath: string;
  private operationChain: Promise<unknown> = Promise.resolve();

  constructor(configService: ConfigService) {
    const configured = configService.get<string>('YEEN_ADDONS_ROOT')?.trim();
    this.rootPath = resolve(
      configured || join(process.cwd(), 'data', 'addons'),
    );
    this.registryPath = join(this.rootPath, 'registry.json');
  }

  async onModuleInit(): Promise<void> {
    await this.promotePendingPackages();
  }

  getRootPath(): string {
    return this.rootPath;
  }

  async list(): Promise<AddonRecord[]> {
    const state = await this.read();
    return Object.values(state.addons)
      .map(cloneRecord)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getSnapshot(): Promise<{
    items: AddonRecord[];
    restartRequired: boolean;
    allowUnsigned: boolean;
  }> {
    const state = await this.read();
    return {
      items: Object.values(state.addons)
        .map(cloneRecord)
        .sort((left, right) => left.name.localeCompare(right.name)),
      restartRequired: state.restartRequired,
      allowUnsigned: state.allowUnsigned,
    };
  }

  async quarantineActive(
    id: string,
    digest: string,
  ): Promise<AddonRecord | null> {
    return this.mutate((state) => {
      const record = state.addons[id];
      if (!record?.active || record.active.digest !== digest) return null;
      record.quarantined = { ...record.active };
      record.active = record.previous ? { ...record.previous } : null;
      record.previous = null;
      if (!record.active) record.enabled = false;
      return cloneRecord(record);
    });
  }

  async getTrustPolicy(): Promise<{ allowUnsigned: boolean }> {
    const state = await this.read();
    return { allowUnsigned: state.allowUnsigned };
  }

  async setAllowUnsigned(
    allowUnsigned: boolean,
  ): Promise<{ allowUnsigned: boolean }> {
    return this.mutate((state) => {
      state.allowUnsigned = allowUnsigned;
      return { allowUnsigned };
    });
  }

  async stagePackage(input: {
    id: string;
    name: string;
    package: InstalledAddonPackage;
  }): Promise<AddonRecord> {
    return this.mutate((state) => {
      const existing = state.addons[input.id];
      const record: AddonRecord = existing
        ? cloneRecord(existing)
        : {
            id: input.id,
            name: input.name,
            enabled: true,
            active: null,
            pending: null,
            previous: null,
          };
      record.name = input.name;
      record.pending = { ...input.package };
      state.addons[input.id] = record;
      state.restartRequired = true;
      return cloneRecord(record);
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<AddonRecord | null> {
    return this.mutate((state) => {
      const record = state.addons[id];
      if (!record) return null;
      record.enabled = enabled;
      state.restartRequired = true;
      return cloneRecord(record);
    });
  }

  async promotePendingPackages(): Promise<AddonRecord[]> {
    return this.mutate((state) => {
      const promoted: AddonRecord[] = [];
      for (const record of Object.values(state.addons)) {
        if (!record.pending) continue;
        record.previous = record.active ? { ...record.active } : null;
        record.active = { ...record.pending };
        record.pending = null;
        promoted.push(cloneRecord(record));
      }
      state.restartRequired = false;
      return promoted;
    });
  }

  private async read(): Promise<AddonRegistryState> {
    return this.serialized(async () => this.readUnsafe());
  }

  private async mutate<TResult>(
    operation: (state: AddonRegistryState) => TResult,
  ): Promise<TResult> {
    return this.serialized(async () => {
      const state = await this.readUnsafe();
      const result = operation(state);
      await this.writeAtomic(state);
      return result;
    });
  }

  private serialized<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const result = this.operationChain.then(operation, operation);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readUnsafe(): Promise<AddonRegistryState> {
    await mkdir(this.rootPath, { recursive: true });
    try {
      const raw = await readFile(this.registryPath, 'utf8');
      return parseRegistry(JSON.parse(raw) as unknown);
    } catch (error) {
      if (isMissingFile(error)) return structuredClone(DEFAULT_STATE);
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException(
          'The add-on registry is corrupt.',
        );
      }
      throw error;
    }
  }

  private async writeAtomic(state: AddonRegistryState): Promise<void> {
    await writeJsonAtomic(this.registryPath, state);
  }
}

function parseRegistry(value: unknown): AddonRegistryState {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    !isObject(value.addons)
  ) {
    throw new InternalServerErrorException(
      'The add-on registry has an unsupported format.',
    );
  }
  return {
    schemaVersion: 1,
    allowUnsigned: value.allowUnsigned === true,
    restartRequired: value.restartRequired === true,
    addons: value.addons as Record<string, AddonRecord>,
  };
}

function cloneRecord(record: AddonRecord): AddonRecord {
  return structuredClone(record);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT';
}
