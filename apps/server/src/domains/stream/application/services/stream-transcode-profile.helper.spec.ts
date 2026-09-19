import { resolveTranscodeProfileValue } from './stream-transcode-profile.helper';

describe('resolveTranscodeProfileValue', () => {
  const defaults = {
    accountMaxBitrateKbps: 16_000,
    systemDefaultVideoBitrateKbps: 4_500,
    systemDefaultAudioBitrateKbps: 128,
    systemDefaultMaxOutputHeight: 2160,
  };

  it('applies the resolution and bitrate profile requested by Playback', () => {
    expect(
      resolveTranscodeProfileValue({
        ...defaults,
        requestedMaxVideoBitrateKbps: 8_000,
        requestedAudioBitrateKbps: 192,
        requestedMaxOutputHeight: 1440,
      }),
    ).toEqual({
      maxVideoBitrateKbps: 8_000,
      audioBitrateKbps: 192,
      maxOutputHeight: 1440,
    });
  });

  it('enforces account and server ceilings on requested profiles', () => {
    expect(
      resolveTranscodeProfileValue({
        ...defaults,
        accountMaxBitrateKbps: 6_000,
        systemDefaultMaxOutputHeight: 1080,
        requestedMaxVideoBitrateKbps: 16_000,
        requestedAudioBitrateKbps: 512,
        requestedMaxOutputHeight: 2160,
      }),
    ).toEqual({
      maxVideoBitrateKbps: 6_000,
      audioBitrateKbps: 384,
      maxOutputHeight: 1080,
    });
  });
});
