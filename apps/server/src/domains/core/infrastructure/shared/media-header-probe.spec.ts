import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMediaFileHeader, scoreMediaHeader } from './media-header-probe';

describe('media-header-probe', () => {
  describe('scoreMediaHeader', () => {
    it('scores known container headers as strong matches', () => {
      const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
      const riff = Buffer.from([0x52, 0x49, 0x46, 0x46]);

      expect(scoreMediaHeader(ebml)).toBe(100);
      expect(scoreMediaHeader(mp4)).toBe(100);
      expect(scoreMediaHeader(riff)).toBe(100);
    });

    it('scores unreadable and all-zero headers conservatively', () => {
      expect(scoreMediaHeader(null)).toBe(0);
      expect(scoreMediaHeader(Buffer.alloc(3))).toBe(0);
      expect(scoreMediaHeader(Buffer.alloc(16))).toBe(-1);
    });

    it('uses file size as a weak tie-breaker for unknown non-zero headers', () => {
      const unknown = Buffer.from([0x11, 0x22, 0x33, 0x44]);
      expect(scoreMediaHeader(unknown)).toBe(1);
      expect(scoreMediaHeader(unknown, 3 * 1024 * 1024 * 1024)).toBe(4);
    });
  });

  describe('readMediaFileHeader', () => {
    it('reads header bytes for regular files', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'yeen-header-probe-'));

      try {
        const filePath = join(tempDir, 'sample.bin');
        const bytes = Buffer.from([0x66, 0x74, 0x79, 0x70, 0x01, 0x02, 0x03]);
        await writeFile(filePath, bytes);

        const header = await readMediaFileHeader(filePath, 4);
        expect(header).not.toBeNull();
        expect(header?.equals(Buffer.from([0x66, 0x74, 0x79, 0x70]))).toBe(
          true,
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('returns null when file does not exist', async () => {
      const missing = join(tmpdir(), `yeen-missing-${Date.now()}.bin`);
      const header = await readMediaFileHeader(missing, 8);
      expect(header).toBeNull();
    });
  });
});
