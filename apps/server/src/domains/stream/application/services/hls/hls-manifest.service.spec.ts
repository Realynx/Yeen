import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HlsManifestService } from './hls-manifest.service';

describe('HlsManifestService', () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-audio-hls-manifest-'));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('writes the exact VOD media playlist used for audio-only MPEGTS segments', async () => {
    const manifestPath = join(scratchDir, 'master.m3u8');
    const service = new HlsManifestService();

    await expect(
      service.writeVodManifest({
        manifestPath,
        segmentSeconds: 6,
        totalDurationSeconds: 13,
      }),
    ).resolves.toBe(3);

    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXTINF:6.000,',
        'segment_00000.ts',
        '#EXTINF:6.000,',
        'segment_00001.ts',
        '#EXTINF:1.000,',
        'segment_00002.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    );
  });

  it('writes a master playlist with a continuous alternate audio rendition', async () => {
    const manifestPath = join(scratchDir, 'master.m3u8');
    const service = new HlsManifestService();

    await service.writeMasterManifest({
      manifestPath,
      videoManifestFileName: 'video.m3u8',
      audioManifestFileName: 'audio.m3u8',
      bandwidthBitsPerSecond: 4_660_000,
    });

    await expect(readFile(manifestPath, 'utf8')).resolves.toContain(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Primary",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"',
    );
    await expect(readFile(manifestPath, 'utf8')).resolves.toContain(
      'AUDIO="audio"\nvideo.m3u8',
    );
  });

  it('adds access tokens to alternate rendition URIs', () => {
    const service = new HlsManifestService();
    const rewritten = service.rewriteWithAccessToken(
      '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\nvideo.m3u8\n',
      'token value',
    );

    expect(rewritten).toContain('URI="audio.m3u8?access_token=token%20value"');
    expect(rewritten).toContain('video.m3u8?access_token=token%20value');
  });
});
