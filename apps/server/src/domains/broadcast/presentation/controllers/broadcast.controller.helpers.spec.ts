import type { BroadcastPublicSessionStatus } from '../../domain/entities/broadcast-session.entity';
import {
  buildPublicDirectLiveManifest,
  buildPublicDirectLiveSubtitleManifest,
  buildPublicDirectRootManifest,
} from './broadcast.controller.helpers';

describe('broadcast controller helpers', () => {
  it('rewrites the direct VLC playlist as a stable, refreshable epoch stream', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:6.000,',
      'segment_00000.ts',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');

    expect(buildPublicDirectLiveManifest(manifest, 'share token', 12)).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MEDIA-SEQUENCE:12000000',
        '#EXT-X-DISCONTINUITY-SEQUENCE:12',
        '#EXT-X-START:TIME-OFFSET=0,PRECISE=YES',
        '#EXTINF:6.000,',
        '/api/broadcast/public/share%20token/direct/hls/12/segment_00000.ts',
        '',
      ].join('\n'),
    );
  });

  it('publishes a muxed audio/video variant for Unity-compatible direct playback', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Primary",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=10128000,AUDIO="audio"',
      'video.m3u8',
      '',
    ].join('\n');
    const status = {
      shareToken: 'share token',
      sourceEpoch: 12,
    } as BroadcastPublicSessionStatus;

    const rewritten = buildPublicDirectRootManifest(
      manifest,
      status,
      'https://yeen.example',
      null,
    );

    expect(rewritten).not.toContain('TYPE=AUDIO');
    expect(rewritten).not.toContain('AUDIO="audio"');
    expect(rewritten).not.toContain('/direct/live/audio.m3u8');
    expect(rewritten).toContain(
      'https://yeen.example/api/broadcast/public/share%20token/direct/live/video.m3u8',
    );
    expect(rewritten).not.toContain('/direct/live/master.m3u8');
  });

  it('publishes a bounded live window so VLC must refresh after a media switch', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:3',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      ...Array.from({ length: 8 }, (_, index) => [
        '#EXTINF:3.000,',
        `segment_${String(index).padStart(5, '0')}.ts`,
      ]).flat(),
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');

    const rewritten = buildPublicDirectLiveManifest(
      manifest,
      'share token',
      12,
      { startSegmentIndex: 4, maxSegments: 3 },
    );

    expect(rewritten.match(/#EXTINF:/g)).toHaveLength(3);
    expect(rewritten).toContain('#EXT-X-MEDIA-SEQUENCE:12000004');
    expect(rewritten).toContain('/segment_00004.ts');
    expect(rewritten).toContain('/segment_00006.ts');
    expect(rewritten).not.toContain('/segment_00003.ts');
    expect(rewritten).not.toContain('/segment_00007.ts');
  });

  it('publishes subtitles through a stable refreshable M3U8 rendition', () => {
    const status = {
      shareToken: 'share token',
      sourceEpoch: 12,
    } as BroadcastPublicSessionStatus;
    const root = buildPublicDirectRootManifest(
      [
        '#EXTM3U',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"',
        'video.m3u8',
      ].join('\n'),
      status,
      'https://yeen.example',
      '/api/broadcast/public/share/subtitles/sub.vtt',
    );

    expect(root).toContain(
      'URI="https://yeen.example/api/broadcast/public/share%20token/direct/live/subtitles.m3u8"',
    );

    const subtitles = buildPublicDirectLiveSubtitleManifest(
      '/api/broadcast/public/share/subtitles/sub.vtt',
      'https://yeen.example',
      12,
    );
    expect(subtitles).toContain('#EXT-X-MEDIA-SEQUENCE:12000000');
    expect(subtitles).toContain('#EXTINF:3.000,');
    expect(subtitles).toContain(
      'https://yeen.example/api/broadcast/public/share/subtitles/sub.vtt',
    );
    expect(subtitles).not.toContain('#EXT-X-ENDLIST');
  });
});
