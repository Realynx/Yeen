import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeVttContent, sanitizeVttFile } from './subtitle-vtt-sanitizer';

describe('sanitizeVttFile', () => {
  it('rejects a corrupt cache file that a browser cannot parse as WebVTT', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'yeen-vtt-sanitizer-'));
    const filePath = join(folder, 'broken.vtt');
    await writeFile(filePath, 'partial subtitle payload', 'utf8');

    try {
      await expect(sanitizeVttFile(filePath)).rejects.toThrow('WebVTT header');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes markerless ASS drawing paths from an otherwise valid WebVTT cache', () => {
    const source = `WEBVTT

00:01:56.510 --> 00:01:56.550 line:45.278% position:48.177% align:start
m 97.50 0.00 l 97.47 2.52 95.00 22.02 -97.50 0.00

00:02:03.310 --> 00:02:08.650 line:35.278% position:6.354% align:start
Skills
`;

    const output = sanitizeVttContent(source);

    expect(output).not.toContain('m 97.50 0.00');
    expect(output).toContain('Skills');
  });
});
