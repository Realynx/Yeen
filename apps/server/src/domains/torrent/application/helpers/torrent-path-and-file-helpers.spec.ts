import {
  applyTorrentPathMappings,
  buildTorrentPathMappings,
  mergeKnownTorrentFiles,
  normalizePathForCompare,
  normalizeTorrentRelativePath,
} from './torrent-path-and-file-helpers';

describe('torrent-path-and-file-helpers', () => {
  describe('normalizePathForCompare', () => {
    it('normalizes slashes, trims trailing slash, and lowercases', () => {
      expect(normalizePathForCompare('C:\\Media\\Shows\\')).toBe(
        'c:/media/shows',
      );
      expect(normalizePathForCompare('/mnt/Media/')).toBe('/mnt/media');
    });
  });

  describe('buildTorrentPathMappings and applyTorrentPathMappings', () => {
    it('applies the longest matching prefix and adapts separators', () => {
      const mappings = buildTorrentPathMappings([
        { from: '/downloads', to: 'D:\\Media' },
        { from: '/downloads/tv', to: 'E:\\TV' },
      ]);

      expect(
        applyTorrentPathMappings('/downloads/tv/show/episode.mkv', mappings),
      ).toBe('E:\\TV\\show\\episode.mkv');

      expect(
        applyTorrentPathMappings('/downloads/movies/title.mkv', mappings),
      ).toBe('D:\\Media\\movies\\title.mkv');
    });

    it('returns input unchanged when no mapping matches', () => {
      const mappings = buildTorrentPathMappings([
        { from: '/downloads', to: '/srv/media' },
      ]);

      expect(applyTorrentPathMappings('/other/path/file.mkv', mappings)).toBe(
        '/other/path/file.mkv',
      );
    });
  });

  describe('normalizeTorrentRelativePath', () => {
    it('normalizes path separators and rejects unsafe traversals', () => {
      expect(normalizeTorrentRelativePath(' Folder\\Video.mkv ')).toBe(
        'Folder/Video.mkv',
      );
      expect(normalizeTorrentRelativePath('./Folder/./Video.mkv')).toBe(
        'Folder/Video.mkv',
      );
      expect(normalizeTorrentRelativePath('../Video.mkv')).toBeNull();
      expect(normalizeTorrentRelativePath('')).toBeNull();
    });
  });

  describe('mergeKnownTorrentFiles', () => {
    it('deduplicates case-insensitively and prefers larger size', () => {
      const merged = mergeKnownTorrentFiles(
        [
          { name: 'Folder/Video.mkv', size: 100 },
          { name: 'Folder/Trailer.mkv', size: 10 },
        ],
        [
          { name: 'folder\\video.mkv', size: 200 },
          { name: 'Folder/Extra/../bad.mkv', size: 300 },
          { name: 'Folder/New.mkv', size: 50 },
        ],
      );

      expect(merged).toEqual(
        expect.arrayContaining([
          { name: 'folder/video.mkv', size: 200 },
          { name: 'Folder/Trailer.mkv', size: 10 },
          { name: 'Folder/New.mkv', size: 50 },
        ]),
      );
      expect(merged.some((entry) => entry.name.includes('..'))).toBe(false);
    });
  });
});
