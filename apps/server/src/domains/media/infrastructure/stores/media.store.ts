import Database from 'better-sqlite3';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { MediaItem } from '../../domain/entities/media-item.entity';
import {
  mediaItemToDbParams,
  mediaRowToItem,
  type MediaRow,
} from './media-store-serialization';

const MEDIA_METADATA_COLUMNS = [
  'id',
  'title',
  'normalized_title',
  'tags_json',
  'description',
  'release_year',
  'season_number',
  'episode_number',
  'episode_title',
  'dedupe_key',
  'relative_path',
  'file_path',
  'extension',
  'container',
  'type',
  'digital_media_type',
  'size_bytes',
  'duration_seconds',
  'width',
  'height',
  'video_codec',
  'audio_codec',
  'subtitle_streams',
  'subtitle_details_json',
  'preview_image_path',
  'backdrop_image_path',
  'chapter_thumbnails_json',
  'media_details_json',
  'series_assignment_rules_json',
  'episode_catalog_source',
  'episode_catalog_source_id',
  'metadata_refreshed_at',
  'updated_at',
] as const;

const MEDIA_METADATA_COLUMNS_SQL = MEDIA_METADATA_COLUMNS.join(',\n          ');
const MEDIA_METADATA_INSERT_COLUMNS_SQL =
  MEDIA_METADATA_COLUMNS.join(',\n        ');
const MEDIA_METADATA_INSERT_VALUES_SQL = MEDIA_METADATA_COLUMNS.map(
  (column) => `@${column}`,
).join(',\n        ');
const MEDIA_METADATA_UPSERT_UPDATE_SQL = MEDIA_METADATA_COLUMNS.filter(
  (column) => column !== 'id' && column !== 'file_path',
)
  .map((column) => `${column} = excluded.${column}`)
  .join(',\n        ');

@Injectable()
export class MediaStore implements OnModuleDestroy {
  private readonly logger = new Logger(MediaStore.name);
  private db: Database.Database | null = null;
  private dbPath: string | null = null;

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async all(): Promise<MediaItem[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(
        `
        SELECT
          ${MEDIA_METADATA_COLUMNS_SQL}
        FROM media_metadata
        ORDER BY title COLLATE NOCASE
        `,
      )
      .all() as MediaRow[];

    return rows.map((row) => mediaRowToItem(row));
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const row = db
      .prepare(
        `
        SELECT COUNT(1) AS total
        FROM media_metadata
        `,
      )
      .get() as { total: number } | undefined;

    if (!row || typeof row.total !== 'number') {
      return 0;
    }

    return row.total;
  }

  async totalSizeBytes(): Promise<number> {
    const db = await this.getDb();
    const row = db
      .prepare(
        `
        SELECT COALESCE(SUM(size_bytes), 0) AS total
        FROM media_metadata
        `,
      )
      .get() as { total: number | bigint } | undefined;

    if (!row) {
      return 0;
    }

    const total =
      typeof row.total === 'bigint' ? Number(row.total) : Number(row.total);

    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  async findById(id: string): Promise<MediaItem | undefined> {
    const db = await this.getDb();
    const row = db
      .prepare(
        `
        SELECT
          ${MEDIA_METADATA_COLUMNS_SQL}
        FROM media_metadata
        WHERE id = ?
        `,
      )
      .get(id) as MediaRow | undefined;

    return row ? mediaRowToItem(row) : undefined;
  }

  async findByFilePath(filePath: string): Promise<MediaItem | undefined> {
    const db = await this.getDb();
    const row = db
      .prepare(
        `
        SELECT
          ${MEDIA_METADATA_COLUMNS_SQL}
        FROM media_metadata
        WHERE file_path = ?
        `,
      )
      .get(filePath) as MediaRow | undefined;

    return row ? mediaRowToItem(row) : undefined;
  }

  async upsert(item: MediaItem): Promise<void> {
    const db = await this.getDb();
    const upsertStatement = db.prepare(
      `
      INSERT INTO media_metadata (
        ${MEDIA_METADATA_INSERT_COLUMNS_SQL}
      ) VALUES (
        ${MEDIA_METADATA_INSERT_VALUES_SQL}
      )
      ON CONFLICT(file_path)
      DO UPDATE SET
        ${MEDIA_METADATA_UPSERT_UPDATE_SQL}
      `,
    );

    upsertStatement.run(mediaItemToDbParams(item));
  }

  async replaceAll(items: MediaItem[]): Promise<void> {
    const db = await this.getDb();
    const removeAllStatement = db.prepare('DELETE FROM media_metadata');
    const insertStatement = db.prepare(
      `
      INSERT INTO media_metadata (
        ${MEDIA_METADATA_INSERT_COLUMNS_SQL}
      ) VALUES (
        ${MEDIA_METADATA_INSERT_VALUES_SQL}
      )
      `,
    );

    const writeTransaction = db.transaction((nextItems: MediaItem[]) => {
      removeAllStatement.run();

      for (const item of nextItems) {
        insertStatement.run(mediaItemToDbParams(item));
      }
    });

    writeTransaction(items);
  }

  async clearAll(): Promise<number> {
    const db = await this.getDb();
    return this.executeMutation(db, 'DELETE FROM media_metadata');
  }

  async deleteById(mediaId: string): Promise<number> {
    const db = await this.getDb();
    return this.executeMutation(
      db,
      `
      DELETE FROM media_metadata
      WHERE id = ?
      `,
      mediaId,
    );
  }

  async updateFilePath(
    mediaId: string,
    newFilePath: string,
    newRelativePath: string,
  ): Promise<void> {
    const db = await this.getDb();
    this.runTimestampedUpdate(
      db,
      `
      UPDATE media_metadata
      SET file_path = ?,
          relative_path = ?,
          updated_at = ?
      WHERE id = ?
      `,
      [newFilePath, newRelativePath],
      [mediaId],
    );
  }

  async clearSeriesAssignmentRules(mediaId: string): Promise<void> {
    const db = await this.getDb();
    this.runTimestampedUpdate(
      db,
      `
      UPDATE media_metadata
      SET series_assignment_rules_json = NULL,
          updated_at = ?
      WHERE id = ?
      `,
      [],
      [mediaId],
    );
  }

  onModuleDestroy(): void {
    this.closeDb();
  }

  private async getDb(): Promise<Database.Database> {
    const settings = await this.systemSettingsService.getSettings();
    const configuredPath = settings.mediaMetadataSqlitePath;
    const resolvedPath = resolve(configuredPath);

    if (!this.db || this.dbPath !== resolvedPath) {
      await mkdir(dirname(resolvedPath), { recursive: true });
      this.closeDb();

      this.db = new Database(resolvedPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.dbPath = resolvedPath;

      this.ensureSchema(this.db);
      this.logger.log(`Using media metadata database: ${resolvedPath}`);
    }

    return this.db;
  }

  private ensureSchema(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS media_metadata (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        release_year INTEGER,
        season_number INTEGER,
        episode_number INTEGER,
        episode_title TEXT,
        dedupe_key TEXT NOT NULL DEFAULT '',
        relative_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        extension TEXT NOT NULL,
        container TEXT,
        type TEXT NOT NULL,
        digital_media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        duration_seconds REAL NOT NULL,
        width INTEGER,
        height INTEGER,
        video_codec TEXT,
        audio_codec TEXT,
        subtitle_streams INTEGER NOT NULL,
        subtitle_details_json TEXT NOT NULL DEFAULT '[]',
        preview_image_path TEXT,
        backdrop_image_path TEXT,
        chapter_thumbnails_json TEXT NOT NULL DEFAULT '[]',
        media_details_json TEXT NOT NULL DEFAULT '{}',
        series_assignment_rules_json TEXT,
        episode_catalog_source TEXT,
        episode_catalog_source_id TEXT,
        metadata_refreshed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureColumns(db);

    db.exec(`

      CREATE UNIQUE INDEX IF NOT EXISTS idx_media_metadata_file_path
        ON media_metadata (file_path);

      CREATE INDEX IF NOT EXISTS idx_media_metadata_title
        ON media_metadata (title);

      CREATE INDEX IF NOT EXISTS idx_media_metadata_type
        ON media_metadata (type);

      CREATE INDEX IF NOT EXISTS idx_media_metadata_dedupe_key
        ON media_metadata (dedupe_key);
    `);
  }

  private ensureColumns(db: Database.Database): void {
    const existingColumns = this.getExistingColumns(db, 'media_metadata');
    this.ensureColumn(
      db,
      existingColumns,
      'normalized_title',
      "TEXT NOT NULL DEFAULT ''",
    );
    this.ensureColumn(
      db,
      existingColumns,
      'tags_json',
      "TEXT NOT NULL DEFAULT '[]'",
    );
    this.ensureColumn(db, existingColumns, 'release_year', 'INTEGER');
    this.ensureColumn(db, existingColumns, 'season_number', 'INTEGER');
    this.ensureColumn(db, existingColumns, 'episode_number', 'INTEGER');
    this.ensureColumn(db, existingColumns, 'episode_title', 'TEXT');
    this.ensureColumn(
      db,
      existingColumns,
      'dedupe_key',
      "TEXT NOT NULL DEFAULT ''",
    );
    this.ensureColumn(
      db,
      existingColumns,
      'chapter_thumbnails_json',
      "TEXT NOT NULL DEFAULT '[]'",
    );
    this.ensureColumn(db, existingColumns, 'backdrop_image_path', 'TEXT');
    this.ensureColumn(
      db,
      existingColumns,
      'series_assignment_rules_json',
      'TEXT',
    );
    this.ensureColumn(db, existingColumns, 'episode_catalog_source', 'TEXT');
    this.ensureColumn(db, existingColumns, 'episode_catalog_source_id', 'TEXT');
  }

  private getExistingColumns(
    db: Database.Database,
    tableName: string,
  ): Set<string> {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;

    return new Set(rows.map((row) => row.name));
  }

  private ensureColumn(
    db: Database.Database,
    existingColumns: Set<string>,
    columnName: string,
    sqlDefinition: string,
  ): void {
    if (existingColumns.has(columnName)) {
      return;
    }

    db.exec(
      `ALTER TABLE media_metadata ADD COLUMN ${columnName} ${sqlDefinition}`,
    );
    existingColumns.add(columnName);
  }

  private closeDb(): void {
    if (!this.db) {
      return;
    }

    this.db.close();
    this.db = null;
    this.dbPath = null;
  }

  private executeMutation(
    db: Database.Database,
    sql: string,
    ...params: unknown[]
  ): number {
    const result = db.prepare(sql).run(...params);
    return typeof result.changes === 'number' ? result.changes : 0;
  }

  private runTimestampedUpdate(
    db: Database.Database,
    sql: string,
    paramsBeforeTimestamp: unknown[],
    paramsAfterTimestamp: unknown[],
  ): void {
    const now = new Date().toISOString();
    db.prepare(sql).run(...paramsBeforeTimestamp, now, ...paramsAfterTimestamp);
  }
}
