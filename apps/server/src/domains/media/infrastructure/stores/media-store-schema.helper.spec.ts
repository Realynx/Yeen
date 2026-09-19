import Database from 'better-sqlite3';
import { ensureMediaMetadataColumnsValue } from './media-store-schema.helper';

describe('ensureMediaMetadataColumnsValue', () => {
  it('migrates a legacy catalog with video-safe defaults', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE media_metadata (id TEXT PRIMARY KEY)');

    ensureMediaMetadataColumnsValue(db);

    const columns = db
      .prepare('PRAGMA table_info(media_metadata)')
      .all() as Array<{ name: string; dflt_value: string | null }>;
    expect(columns.find((column) => column.name === 'library_type')).toEqual(
      expect.objectContaining({ dflt_value: "'video'" }),
    );
    expect(
      columns.some((column) => column.name === 'music_metadata_json'),
    ).toBe(true);
    db.close();
  });

  it('classifies audio rows from an existing catalog as music', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE media_metadata (
        id TEXT PRIMARY KEY,
        digital_media_type TEXT NOT NULL
      );
      INSERT INTO media_metadata (id, digital_media_type)
      VALUES ('audio-1', 'audio'), ('video-1', 'video');
    `);

    ensureMediaMetadataColumnsValue(db);

    const rows = db
      .prepare('SELECT id, library_type FROM media_metadata ORDER BY id')
      .all();
    expect(rows).toEqual([
      { id: 'audio-1', library_type: 'music' },
      { id: 'video-1', library_type: 'video' },
    ]);
    db.close();
  });
});
