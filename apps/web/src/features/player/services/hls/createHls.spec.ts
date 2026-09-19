import { describe, expect, it } from 'vitest';
import { withLatestHlsAccessToken } from './createHls';

describe('HLS rolling authentication', () => {
  it('replaces an expired manifest token with the latest access token', () => {
    const updated = withLatestHlsAccessToken(
      'https://yeen.example/api/stream/hls/session/video.m3u8?access_token=old-token',
      'fresh token',
    );

    expect(updated).toBe(
      'https://yeen.example/api/stream/hls/session/video.m3u8?access_token=fresh+token',
    );
  });
});
