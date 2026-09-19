import Database from 'better-sqlite3';

const MEDIA_METADATA_REQUIRED_COLUMNS: Array<{
  name: string;
  definition: string;
}> = [
  { name: 'normalized_title', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'tags_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'release_year', definition: 'INTEGER' },
  { name: 'season_number', definition: 'INTEGER' },
  { name: 'episode_number', definition: 'INTEGER' },
  { name: 'episode_title', definition: 'TEXT' },
  { name: 'dedupe_key', definition: "TEXT NOT NULL DEFAULT ''" },
  { name: 'chapter_thumbnails_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'backdrop_image_path', definition: 'TEXT' },
  { name: 'series_assignment_rules_json', definition: 'TEXT' },
  { name: 'episode_catalog_source', definition: 'TEXT' },
  { name: 'episode_catalog_source_id', definition: 'TEXT' },
  { name: 'library_type', definition: "TEXT NOT NULL DEFAULT 'video'" },
  { name: 'music_metadata_json', definition: 'TEXT' },
];

function getExistingColumns(
  db: Database.Database,
  tableName: string,
): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;

  return new Set(rows.map((row) => row.name));
}

function ensureColumn(
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

export function ensureMediaMetadataColumnsValue(db: Database.Database): void {
  const existingColumns = getExistingColumns(db, 'media_metadata');

  for (const column of MEDIA_METADATA_REQUIRED_COLUMNS) {
    ensureColumn(db, existingColumns, column.name, column.definition);
  }

  // Catalogs created before library_type existed may already contain audio
  // items. Preserve their meaning instead of silently presenting them in the
  // video experience after migration.
  if (existingColumns.has('digital_media_type')) {
    db.exec(`
      UPDATE media_metadata
      SET library_type = 'music'
      WHERE digital_media_type = 'audio'
        AND library_type = 'video'
    `);
  }
}
