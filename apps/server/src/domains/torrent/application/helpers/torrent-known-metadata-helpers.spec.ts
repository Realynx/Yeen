import {
  buildKnownTorrentMetadataUpsertEntry,
  cloneKnownTorrentMetadata,
  type KnownTorrentMetadataRecord,
} from './torrent-known-metadata-helpers';

describe('torrent-known-metadata-helpers', () => {
  const baseRecord: KnownTorrentMetadataRecord = {
    hash: 'a'.repeat(40),
    titleHint: 'Old Title',
    mediaHint: {
      title: 'Old Show',
      normalizedTitle: 'old show',
      releaseYear: 2020,
      mediaType: 'show',
      description: 'old description',
      tags: ['old'],
      posterUrl: 'https://old/poster.jpg',
      backdropUrl: null,
      remoteSource: 'tmdb',
      remoteSourceId: '111',
    },
    savePath: '/old/save',
    contentPath: '/old/content',
    files: [{ name: 'Folder/Video.mkv', size: 100 }],
    updatedAtMs: 1,
  };

  it('clones known metadata deeply for mutable fields', () => {
    const cloned = cloneKnownTorrentMetadata(baseRecord);
    expect(cloned).not.toBeNull();

    expect(cloned).toEqual(baseRecord);
    expect(cloned).not.toBe(baseRecord);
    expect(cloned?.files).not.toBe(baseRecord.files);
    expect(cloned?.mediaHint?.tags).not.toBe(baseRecord.mediaHint?.tags);

    if (cloned?.mediaHint) {
      cloned.mediaHint.tags.push('new-tag');
    }
    if (cloned?.files[0]) {
      cloned.files[0].name = 'Changed/Name.mkv';
    }

    expect(baseRecord.mediaHint?.tags).toEqual(['old']);
    expect(baseRecord.files[0]?.name).toBe('Folder/Video.mkv');
  });

  it('builds upsert entry preserving existing values for omitted fields', () => {
    const entry = buildKnownTorrentMetadataUpsertEntry({
      normalizedHash: baseRecord.hash,
      existing: baseRecord,
      update: {
        hash: baseRecord.hash,
        titleHint: '   ',
        mediaHint: null,
        savePath: '   ',
        contentPath: null,
        files: [],
      },
      nowMs: 999,
    });

    expect(entry.hash).toBe(baseRecord.hash);
    expect(entry.titleHint).toBe(baseRecord.titleHint);
    expect(entry.savePath).toBe(baseRecord.savePath);
    expect(entry.contentPath).toBe(baseRecord.contentPath);
    expect(entry.mediaHint).toEqual(baseRecord.mediaHint);
    expect(entry.files).toEqual(baseRecord.files);
    expect(entry.updatedAtMs).toBe(999);
  });

  it('builds upsert entry with normalized incoming hint and merged files', () => {
    const entry = buildKnownTorrentMetadataUpsertEntry({
      normalizedHash: 'b'.repeat(40),
      existing: baseRecord,
      update: {
        hash: 'B'.repeat(40),
        titleHint: ' New Title ',
        mediaHint: {
          title: '  New Show  ',
          normalizedTitle: '',
          releaseYear: 2024.9,
          mediaType: 'movie',
          description: '  new description  ',
          tags: [' new ', ''],
          posterUrl: ' https://new/poster.jpg ',
          backdropUrl: '',
          remoteSource: 'jikan',
          remoteSourceId: '  222  ',
        },
        savePath: '/new/save',
        contentPath: '/new/content',
        files: [
          { name: 'folder\\video.mkv', size: 200 },
          { name: '../bad.mkv', size: 300 },
        ],
      },
      nowMs: 1234,
    });

    expect(entry.hash).toBe('b'.repeat(40));
    expect(entry.titleHint).toBe('New Title');
    expect(entry.savePath).toBe('/new/save');
    expect(entry.contentPath).toBe('/new/content');
    expect(entry.updatedAtMs).toBe(1234);
    expect(entry.mediaHint).toEqual({
      title: 'New Show',
      normalizedTitle: 'New Show',
      releaseYear: 2024,
      mediaType: 'movie',
      description: 'new description',
      tags: ['new'],
      posterUrl: 'https://new/poster.jpg',
      backdropUrl: null,
      remoteSource: 'jikan',
      remoteSourceId: '222',
    });
    expect(entry.files).toEqual(
      expect.arrayContaining([{ name: 'folder/video.mkv', size: 200 }]),
    );
    expect(entry.files.some((file) => file.name.includes('..'))).toBe(false);
  });
});
