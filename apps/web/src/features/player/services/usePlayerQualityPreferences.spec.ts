import { describe, expect, it } from 'vitest';
import { derivePlayerQualityOptions } from './usePlayerQualityPreferences';
import { isHlsRecoveryAttempt } from './usePlayerData';

describe('player transcode quality options', () => {
  it('keeps higher account-authorized profiles available after a lower profile is applied', () => {
    const options = derivePlayerQualityOptions({
      accountVideoQuotaKbps: 16_000,
      maxResolutionForBitrateBudget: 720,
      preferredMaxResolutionHeight: 720,
      preferredVideoBitrateKbps: 2_500,
      preferredAudioBitrateKbps: 128,
      appliedMaxOutputHeight: 720,
      appliedVideoBitrateKbps: 2_500,
      appliedAudioBitrateKbps: 128,
    });

    expect(options.effectiveVideoBitrateQuotaKbps).toBe(16_000);
    expect(options.videoBitrateOptionsKbps).toContain(16_000);
  });

  it('keeps higher resolutions available when only the applied height is lower', () => {
    const options = derivePlayerQualityOptions({
      accountVideoQuotaKbps: 16_000,
      maxResolutionForBitrateBudget: 2160,
      preferredMaxResolutionHeight: 720,
      preferredVideoBitrateKbps: null,
      preferredAudioBitrateKbps: null,
      appliedMaxOutputHeight: 720,
      appliedVideoBitrateKbps: 16_000,
      appliedAudioBitrateKbps: 128,
    });

    expect(options.resolutionHeightOptions).toContain(2160);
  });
});

describe('HLS restart classification', () => {
  it('does not rate-limit deliberate profile changes as automatic error recovery', () => {
    expect(isHlsRecoveryAttempt({ forceFresh: true })).toBe(false);
    expect(isHlsRecoveryAttempt({ forceFresh: true, recoveryAttempt: true })).toBe(true);
  });
});
