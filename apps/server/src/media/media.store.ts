import Database from 'better-sqlite3';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  MediaChapterThumbnail,
  MediaDetails,
  MediaItem,
  SeriesAssignmentRules,
  MediaSubtitleDetail,
} from './entities/media-item.entity';

interface MediaRow {
  id: string;
  title: string;
  normalized_title: string;
  tags_json: string;
  description: string | null;
  release_year: number | null;
  season_number: number | null;
  episode_number: number | null;
  episode_title: string | null;
  dedupe_key: string;
  relative_path: string;
  file_path: string;
  extension: string;
  container: string | null;
  type: 'movie' | 'show' | 'other';
  digital_media_type: 'video' | 'audio' | 'image' | 'other';
  size_bytes: number;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  subtitle_streams: number;
  subtitle_details_json: string;
  preview_image_path: string | null;
  backdrop_image_path: string | null;
  chapter_thumbnails_json: string;
  media_details_json: string;
  series_assignment_rules_json: string | null;
  episode_catalog_source: 'tmdb' | 'jikan' | null;
  episode_catalog_source_id: string | null;
  metadata_refreshed_at: string;
  updated_at: string;
}

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

    return rows.map((row) => this.toMediaItem(row));
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

    return row ? this.toMediaItem(row) : undefined;
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

    return row ? this.toMediaItem(row) : undefined;
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

    upsertStatement.run(this.toDbParams(item));
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
        insertStatement.run(this.toDbParams(item));
      }
    });

    writeTransaction(items);
  }

  async clearAll(): Promise<number> {
    const db = await this.getDb();
    const removeAllStatement = db.prepare('DELETE FROM media_metadata');
    const result = removeAllStatement.run();

    return typeof result.changes === 'number' ? result.changes : 0;
  }

  async deleteById(mediaId: string): Promise<number> {
    const db = await this.getDb();
    const result = db
      .prepare(
        `
        DELETE FROM media_metadata
        WHERE id = ?
        `,
      )
      .run(mediaId);

    return typeof result.changes === 'number' ? result.changes : 0;
  }

  async updateFilePath(
    mediaId: string,
    newFilePath: string,
    newRelativePath: string,
  ): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE media_metadata
      SET file_path = ?,
          relative_path = ?,
          updated_at = ?
      WHERE id = ?
      `,
    ).run(newFilePath, newRelativePath, now, mediaId);
  }

  async clearSeriesAssignmentRules(mediaId: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE media_metadata
      SET series_assignment_rules_json = NULL,
          updated_at = ?
      WHERE id = ?
      `,
    ).run(now, mediaId);
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
    this.ensureColumn(db, existingColumns, 'series_assignment_rules_json', 'TEXT');
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

  private toMediaItem(row: MediaRow): MediaItem {
    const chapterThumbnails = this.parseChapterThumbnails(
      row.chapter_thumbnails_json,
    );

    return {
      id: row.id,
      title: row.title,
      normalizedTitle:
        row.normalized_title || this.normalizeTitle(row.title || ''),
      tags: this.parseTags(row.tags_json),
      description: row.description,
      releaseYear: this.toFiniteInteger(row.release_year),
      seasonNumber: this.toFiniteInteger(row.season_number),
      episodeNumber: this.toFiniteInteger(row.episode_number),
      episodeTitle: this.toNullableString(row.episode_title),
      dedupeKey: row.dedupe_key || this.buildDedupeKeyFromRow(row),
      relativePath: row.relative_path,
      filePath: row.file_path,
      extension: row.extension,
      container: row.container,
      type: row.type,
      digitalMediaType: row.digital_media_type,
      sizeBytes: row.size_bytes,
      durationSeconds: row.duration_seconds,
      width: row.width,
      height: row.height,
      videoCodec: row.video_codec,
      audioCodec: row.audio_codec,
      subtitleStreams: row.subtitle_streams,
      subtitleDetails: this.parseSubtitleDetails(row.subtitle_details_json),
      previewImagePath: row.preview_image_path,
      backdropImagePath:
        this.toNullableString(row.backdrop_image_path) ??
        chapterThumbnails[0]?.imagePath ??
        null,
      chapterThumbnails,
      mediaDetails: this.parseMediaDetails(row.media_details_json),
      seriesAssignmentRules: this.parseSeriesAssignmentRules(
        row.series_assignment_rules_json,
      ),
      episodeCatalogSource:
        (row.episode_catalog_source === 'tmdb' ||
          row.episode_catalog_source === 'jikan')
          ? row.episode_catalog_source
          : null,
      episodeCatalogSourceId: this.toNullableString(
        row.episode_catalog_source_id,
      ),
      metadataRefreshedAt: row.metadata_refreshed_at || row.updated_at,
      updatedAt: row.updated_at,
    };
  }

  private parseSubtitleDetails(raw: string): MediaSubtitleDetail[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
        .map((item) => {
          const kind = item.kind === 'external' ? 'external' : 'embedded';
          const label = typeof item.label === 'string' ? item.label : kind;
          const source = typeof item.source === 'string' ? item.source : '';
          const language =
            typeof item.language === 'string' && item.language.trim()
              ? item.language
              : null;

          return {
            kind,
            label,
            source,
            language,
          };
        });
    } catch {
      return [];
    }
  }

  private parseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      const tags = parsed.filter(
        (entry): entry is string => typeof entry === 'string',
      );
      return this.normalizeTags(tags);
    } catch {
      return [];
    }
  }

  private parseChapterThumbnails(raw: string): MediaChapterThumbnail[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry) => {
          if (
            typeof entry !== 'object' ||
            entry === null ||
            Array.isArray(entry)
          ) {
            return null;
          }

          const value = entry as Record<string, unknown>;
          const imagePath =
            typeof value.imagePath === 'string' ? value.imagePath.trim() : '';
          const second =
            typeof value.second === 'number' && Number.isFinite(value.second)
              ? value.second
              : null;

          if (!imagePath || second === null) {
            return null;
          }

          return {
            imagePath,
            second,
          };
        })
        .filter((entry): entry is MediaChapterThumbnail => !!entry);
    } catch {
      return [];
    }
  }

  private parseMediaDetails(raw: string): MediaDetails {
    const fallback = this.defaultMediaDetails();

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return fallback;
      }

      const details = parsed as Record<string, unknown>;
      return {
        formatName:
          typeof details.formatName === 'string' ? details.formatName : null,
        bitRate: this.toFiniteNumber(details.bitRate),
        frameRate: this.toFiniteNumber(details.frameRate),
        audioChannels: this.toFiniteNumber(details.audioChannels),
      };
    } catch {
      return fallback;
    }
  }

  private parseSeriesAssignmentRules(
    raw: string | null,
  ): SeriesAssignmentRules | null {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return null;
      }

      const source = parsed as Record<string, unknown>;
      const keywordMappings = this.parseSeriesKeywordMappings(
        source.keywordMappings,
      );
      const patternMappings = this.parseSeriesPatternMappings(
        source.patternMappings,
      );

      if (keywordMappings.length === 0 && patternMappings.length === 0) {
        return null;
      }

      const rules: SeriesAssignmentRules = {};
      if (keywordMappings.length > 0) {
        rules.keywordMappings = keywordMappings;
      }
      if (patternMappings.length > 0) {
        rules.patternMappings = patternMappings;
      }

      return rules;
    } catch {
      return null;
    }
  }

  private parseSeriesKeywordMappings(
    value: unknown,
  ): NonNullable<SeriesAssignmentRules['keywordMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const rules: NonNullable<SeriesAssignmentRules['keywordMappings']> = [];

    for (const entry of value) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry)
      ) {
        continue;
      }

      const row = entry as Record<string, unknown>;
      const keyword = typeof row.keyword === 'string' ? row.keyword.trim() : '';
      if (!keyword) {
        continue;
      }

      const seasonNumber = this.toFiniteInteger(row.seasonNumber);
      const episodeNumber = this.toFiniteInteger(row.episodeNumber);

      if (seasonNumber === null && episodeNumber === null) {
        continue;
      }

      rules.push({
        keyword,
        seasonNumber,
        episodeNumber,
      });
    }

    return rules;
  }

  private parseSeriesPatternMappings(
    value: unknown,
  ): NonNullable<SeriesAssignmentRules['patternMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const rules: NonNullable<SeriesAssignmentRules['patternMappings']> = [];

    for (const entry of value) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry)
      ) {
        continue;
      }

      const row = entry as Record<string, unknown>;
      const pattern = typeof row.pattern === 'string' ? row.pattern.trim() : '';
      if (!pattern) {
        continue;
      }

      const seasonGroup = this.toFiniteInteger(row.seasonGroup);
      const episodeGroup = this.toFiniteInteger(row.episodeGroup);
      const seasonNumber = this.toFiniteInteger(row.seasonNumber);
      const episodeNumber = this.toFiniteInteger(row.episodeNumber);

      if (
        seasonGroup === null &&
        episodeGroup === null &&
        seasonNumber === null &&
        episodeNumber === null
      ) {
        continue;
      }

      rules.push({
        pattern,
        flags: typeof row.flags === 'string' ? row.flags : undefined,
        seasonGroup,
        episodeGroup,
        seasonNumber,
        episodeNumber,
      });
    }

    return rules;
  }

  private defaultMediaDetails(): MediaDetails {
    return {
      formatName: null,
      bitRate: null,
      frameRate: null,
      audioChannels: null,
    };
  }

  private toDbParams(item: MediaItem): Record<string, unknown> {
    return {
      id: item.id,
      title: item.title,
      normalized_title: item.normalizedTitle || this.normalizeTitle(item.title),
      tags_json: JSON.stringify(this.normalizeTags(item.tags)),
      description: item.description,
      release_year: item.releaseYear,
      season_number: item.seasonNumber,
      episode_number: item.episodeNumber,
      episode_title: item.episodeTitle,
      dedupe_key: item.dedupeKey || this.buildDedupeKey(item),
      relative_path: item.relativePath,
      file_path: item.filePath,
      extension: item.extension,
      container: item.container,
      type: item.type,
      digital_media_type: item.digitalMediaType,
      size_bytes: item.sizeBytes,
      duration_seconds: item.durationSeconds,
      width: item.width,
      height: item.height,
      video_codec: item.videoCodec,
      audio_codec: item.audioCodec,
      subtitle_streams: item.subtitleStreams,
      subtitle_details_json: JSON.stringify(item.subtitleDetails ?? []),
      preview_image_path: item.previewImagePath,
      backdrop_image_path: item.backdropImagePath,
      chapter_thumbnails_json: JSON.stringify(item.chapterThumbnails ?? []),
      media_details_json: JSON.stringify(
        item.mediaDetails ?? this.defaultMediaDetails(),
      ),
      series_assignment_rules_json: item.seriesAssignmentRules
        ? JSON.stringify(item.seriesAssignmentRules)
        : null,
      episode_catalog_source:
        (item.episodeCatalogSource === 'tmdb' ||
          item.episodeCatalogSource === 'jikan')
          ? item.episodeCatalogSource
          : null,
      episode_catalog_source_id: this.toNullableString(
        item.episodeCatalogSourceId,
      ),
      metadata_refreshed_at: item.metadataRefreshedAt ?? item.updatedAt,
      updated_at: item.updatedAt,
    };
  }

  private normalizeTags(tags: readonly string[] | null | undefined): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const deduped = new Map<string, string>();
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        continue;
      }

      const cleaned = tag.trim();
      if (!cleaned) {
        continue;
      }

      const key = cleaned.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, cleaned);
      }
    }

    return [...deduped.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toFiniteInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    return Math.round(value);
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeTitle(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private buildDedupeKey(item: {
    type: 'movie' | 'show' | 'other';
    normalizedTitle: string;
    releaseYear: number | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    durationSeconds: number;
  }): string {
    const normalizedTitle =
      item.normalizedTitle || this.normalizeTitle('untitled');

    if (item.type === 'show') {
      return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
    }

    if (item.type === 'movie') {
      return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  private buildDedupeKeyFromRow(row: MediaRow): string {
    return this.buildDedupeKey({
      type: row.type,
      normalizedTitle: row.normalized_title || this.normalizeTitle(row.title),
      releaseYear: this.toFiniteInteger(row.release_year),
      seasonNumber: this.toFiniteInteger(row.season_number),
      episodeNumber: this.toFiniteInteger(row.episode_number),
      durationSeconds: row.duration_seconds,
    });
  }
}
