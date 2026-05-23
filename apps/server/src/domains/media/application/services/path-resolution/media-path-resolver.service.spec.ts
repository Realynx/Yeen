import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { MediaPathResolverService } from './media-path-resolver.service';

describe('MediaPathResolverService', () => {
  const resolver = new MediaPathResolverService();

  describe('buildTorrentAbsoluteFileCandidates', () => {
    it('builds de-duplicated candidate paths from save and content roots', () => {
      const savePath = resolve('downloads');
      const contentPath = resolve('downloads', 'Example Pack');
      const torrentRelativePath = 'Example Pack/Video File.mkv';

      const candidates = resolver.buildTorrentAbsoluteFileCandidates({
        savePath,
        contentPath,
        torrentRelativePath,
      });

      const lowerKeys = new Set(
        candidates.map((candidate) => candidate.toLowerCase()),
      );
      expect(lowerKeys.size).toBe(candidates.length);
      expect(candidates).toContain(resolve(savePath, torrentRelativePath));
      expect(candidates).toContain(resolve(savePath, 'Video File.mkv'));
      expect(candidates).toContain(resolve(contentPath, torrentRelativePath));
      expect(candidates).toContain(resolve(contentPath, 'Video File.mkv'));
    });
  });

  describe('buildMediaFilePathCandidates', () => {
    it('includes root-relative, label-stripped, and .!qB variants', () => {
      const root = resolve('Media');
      const candidates = resolver.buildMediaFilePathCandidates(
        'Movies/Inception.mkv',
        'Media/Movies/Inception.mkv',
        { roots: [root] },
      );

      expect(candidates).toContain(resolve(root, 'Movies', 'Inception.mkv'));
      expect(candidates).toContain(
        resolve(root, 'Movies', 'Inception.mkv.!qB'),
      );
    });
  });

  describe('resolveRelativePathFuzzy', () => {
    it('resolves by case-insensitive token matching and optional root label prefix', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'yeen-media-path-'));

      try {
        const moviesDir = join(tempRoot, 'Movies');
        await mkdir(moviesDir, { recursive: true });

        const mediaFilePath = join(moviesDir, 'The Matrix.mkv');
        await writeFile(mediaFilePath, 'test');

        const withLabel = `${basename(tempRoot)}/movies/the-matrix.mkv`;
        const resolvedWithLabel = await resolver.resolveRelativePathFuzzy(
          withLabel,
          { roots: [tempRoot] },
        );

        expect(resolvedWithLabel).toBe(mediaFilePath);

        const resolvedWithoutLabel = await resolver.resolveRelativePathFuzzy(
          'movies/the-matrix.mkv',
          { roots: [tempRoot] },
        );

        expect(resolvedWithoutLabel).toBe(mediaFilePath);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
