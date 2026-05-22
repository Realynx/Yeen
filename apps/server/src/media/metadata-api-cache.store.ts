import Database from 'better-sqlite3';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SystemSettingsService } from '../system-settings/system-settings.service';

interface MetadataApiCacheRow {
  response_json: string;
  updated_at: string;
}

interface MetadataApiCacheGetOptions {
  maxAgeMs?: number;
}

@Injectable()
export class MetadataApiCacheStore implements OnModuleDestroy {
  private readonly logger = new Logger(MetadataApiCacheStore.name);
  private db: Database.Database | null = null;
  private dbPath: string | null = null;

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async get<T>(
    provider: string,
    requestKey: string,
    options?: MetadataApiCacheGetOptions,
  ): Promise<T | undefined> {
    const db = await this.getDb();
    const row = db
      .prepare(
        `
        SELECT response_json, updated_at
        FROM metadata_api_cache
        WHERE provider = ?
          AND request_key = ?
        `,
      )
      .get(provider, requestKey) as MetadataApiCacheRow | undefined;

    if (!row) {
      return undefined;
    }

    const maxAgeMs = options?.maxAgeMs;
    if (
      typeof maxAgeMs === 'number' &&
      Number.isFinite(maxAgeMs) &&
      maxAgeMs > 0
    ) {
      const updatedAtMs = Date.parse(row.updated_at);
      const isFresh = Number.isFinite(updatedAtMs)
        ? Date.now() - updatedAtMs <= maxAgeMs
        : false;

      if (!isFresh) {
        db.prepare(
          `
          DELETE FROM metadata_api_cache
          WHERE provider = ?
            AND request_key = ?
          `,
        ).run(provider, requestKey);

        return undefined;
      }
    }

    try {
      return JSON.parse(row.response_json) as T;
    } catch {
      db.prepare(
        `
        DELETE FROM metadata_api_cache
        WHERE provider = ?
          AND request_key = ?
        `,
      ).run(provider, requestKey);

      return undefined;
    }
  }

  async set(
    provider: string,
    requestKey: string,
    value: unknown,
  ): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO metadata_api_cache (
        provider,
        request_key,
        response_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, request_key)
      DO UPDATE SET
        response_json = excluded.response_json,
        updated_at = excluded.updated_at
      `,
    ).run(provider, requestKey, JSON.stringify(value ?? null), now, now);
  }

  async clear(provider?: string): Promise<number> {
    const db = await this.getDb();
    const normalizedProvider = provider?.trim();

    if (normalizedProvider) {
      const result = db
        .prepare(
          `
          DELETE FROM metadata_api_cache
          WHERE provider = ?
          `,
        )
        .run(normalizedProvider);

      return result.changes;
    }

    const result = db
      .prepare(
        `
        DELETE FROM metadata_api_cache
        `,
      )
      .run();

    return result.changes;
  }

  onModuleDestroy(): void {
    this.closeDb();
  }

  private async getDb(): Promise<Database.Database> {
    const settings = await this.systemSettingsService.getSettings();
    const resolvedPath = resolve(settings.mediaMetadataSqlitePath);

    if (!this.db || this.dbPath !== resolvedPath) {
      await mkdir(dirname(resolvedPath), { recursive: true });
      this.closeDb();

      this.db = new Database(resolvedPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.dbPath = resolvedPath;

      this.ensureSchema(this.db);
      this.logger.log(`Using metadata API cache database: ${resolvedPath}`);
    }

    return this.db;
  }

  private ensureSchema(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata_api_cache (
        provider TEXT NOT NULL,
        request_key TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, request_key)
      );

      CREATE INDEX IF NOT EXISTS idx_metadata_api_cache_updated_at
        ON metadata_api_cache (updated_at);
    `);
  }

  private closeDb(): void {
    if (!this.db) {
      return;
    }

    this.db.close();
    this.db = null;
    this.dbPath = null;
  }
}
