import { Injectable } from '@nestjs/common';
import { open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonFileStore } from '../../infrastructure/shared/json-file-store';

export const ADDON_SETTINGS = Symbol.for('com.yeen.addons.settings.v1');

interface SettingsState {
  schemaVersion: 1;
  addons: Record<string, Record<string, unknown>>;
  completedMigrations: string[];
}

export interface LegacySettingsMigration {
  migrationId: string;
  fields: readonly string[];
}

@Injectable()
export class AddonSettingsStore extends JsonFileStore<SettingsState> {
  private readonly legacySystemSettingsPath = join(
    process.cwd(),
    'data',
    'system-settings.json',
  );

  constructor() {
    super(join(process.cwd(), 'data', 'addon-settings.json'), {
      schemaVersion: 1,
      addons: {},
      completedMigrations: [],
    });
  }

  async get(addonId: string): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    return structuredClone(this.state.addons[addonId] ?? {});
  }

  async replace(
    addonId: string,
    settings: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    this.state.addons[addonId] = structuredClone(settings);
    await this.queueSave();
    return structuredClone(this.state.addons[addonId]);
  }

  /**
   * One-time bridge for add-ons extracted from historical Core Yeen settings.
   * Existing add-on values win, and the migration is marked complete even when
   * no legacy file exists so a deliberately cleared setting is never restored.
   */
  async migrateLegacy(
    addonId: string,
    migration: LegacySettingsMigration,
  ): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    const marker = `${addonId}:${migration.migrationId}`;
    if (this.state.completedMigrations.includes(marker)) {
      return structuredClone(this.state.addons[addonId] ?? {});
    }

    const legacy = await this.readLegacySystemSettings();
    const migrated = Object.fromEntries(
      migration.fields
        .filter((field) => Object.prototype.hasOwnProperty.call(legacy, field))
        .map((field) => [field, legacy[field]]),
    );

    this.state.addons[addonId] = {
      ...migrated,
      ...(this.state.addons[addonId] ?? {}),
    };
    // Persist the private values before removing their legacy source.
    await this.queueSave();
    await this.scrubLegacySystemSettings(migration.fields);
    this.state.completedMigrations.push(marker);
    await this.queueSave();
    return structuredClone(this.state.addons[addonId]);
  }

  protected parseLoadedState(value: unknown): SettingsState {
    if (!isObject(value)) return this.defaultState();

    if (value.schemaVersion === 1 && isObject(value.addons)) {
      return {
        schemaVersion: 1,
        addons: filterSettingsMap(value.addons),
        completedMigrations: Array.isArray(value.completedMigrations)
          ? value.completedMigrations.filter(
              (entry): entry is string => typeof entry === 'string',
            )
          : [],
      };
    }

    // Read the short-lived flat shape used by early add-on host builds.
    return {
      schemaVersion: 1,
      addons: filterSettingsMap(value),
      completedMigrations: [],
    };
  }

  protected defaultState(): SettingsState {
    return { schemaVersion: 1, addons: {}, completedMigrations: [] };
  }

  private async readLegacySystemSettings(): Promise<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(
        await readFile(this.legacySystemSettingsPath, 'utf8'),
      ) as unknown;
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private async scrubLegacySystemSettings(
    fields: readonly string[],
  ): Promise<void> {
    const legacy = await this.readLegacySystemSettings();
    const selected = new Set(fields);
    if (!Object.keys(legacy).some((field) => selected.has(field))) return;

    const scrubbed = Object.fromEntries(
      Object.entries(legacy).filter(([field]) => !selected.has(field)),
    );
    const tempPath = `${this.legacySystemSettingsPath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(tempPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(scrubbed, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, this.legacySystemSettingsPath);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function filterSettingsMap(
  value: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] => isObject(entry[1]),
    ),
  );
}
