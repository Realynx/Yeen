import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemSettings } from './types';
import { updateSystemSettings } from './api-media-search';

const settings: SystemSettings = {
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  thumbnailCaptureCount: 6,
  mediaMetadataSqlitePath: 'metadata.sqlite',
  tmdbApiKey: '',
  openSubtitlesApiKey: '',
  theAudioDbEnabled: true,
  theAudioDbChartCountry: 'US',
  theAudioDbHasCustomApiKey: true,
  transcodeHardwareAcceleration: 'auto',
  transcodePreset: 'fast',
  transcodeCrf: 23,
  transcodeDefaultMaxBitrateKbps: 8000,
  transcodeAudioBitrateKbps: 192,
  transcodeMaxOutputHeight: 1080,
  transcodeRateControlBufferSeconds: 2,
  hlsSegmentSeconds: 6,
  subtitleDefaultLanguage: 'en',
};

describe('TheAudioDB system settings writes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits the response-only key status and preserves a saved key by default', async () => {
    const fetchMock = stubSettingsResponse();
    await updateSystemSettings('token', settings);

    const payload = requestPayload(fetchMock);
    expect(payload.theAudioDbHasCustomApiKey).toBeUndefined();
    expect(payload.theAudioDbCustomApiKey).toBeUndefined();
    expect(payload.clearTheAudioDbCustomApiKey).toBeUndefined();
  });

  it('sends a newly entered premium key', async () => {
    const fetchMock = stubSettingsResponse();
    await updateSystemSettings('token', {
      ...settings,
      theAudioDbCustomApiKey: 'new-premium-key',
    });

    const payload = requestPayload(fetchMock);
    expect(payload.theAudioDbCustomApiKey).toBe('new-premium-key');
    expect(payload.clearTheAudioDbCustomApiKey).toBeUndefined();
  });

  it('sends clear intent only when the administrator chooses it', async () => {
    const fetchMock = stubSettingsResponse();
    await updateSystemSettings('token', {
      ...settings,
      clearTheAudioDbCustomApiKey: true,
    });

    const payload = requestPayload(fetchMock);
    expect(payload.theAudioDbCustomApiKey).toBeUndefined();
    expect(payload.clearTheAudioDbCustomApiKey).toBe(true);
  });
});

function stubSettingsResponse() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify(settings),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestPayload(fetchMock: ReturnType<typeof vi.fn>) {
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(request.body)) as Record<string, unknown>;
}
