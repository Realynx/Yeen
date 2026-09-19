import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlayerSettingsMenu } from './PlayerSettingsMenu';

describe('PlayerSettingsMenu', () => {
  it('presents resolution first and keeps bitrate controls in an advanced section', () => {
    const markup = renderToStaticMarkup(
      <PlayerSettingsMenu
        open
        playbackRate={1}
        subtitleFontPreset="clear"
        videoBitrateQuotaKbps={16_000}
        isHlsSource
        hlsLevels={[]}
        qualityMode="auto"
        resolutionHeightOptions={[720, 1080, 2160]}
        preferredMaxResolutionHeight={1080}
        videoBitrateOptionsKbps={[2_500, 4_500, 16_000]}
        preferredVideoBitrateKbps={4_500}
        audioBitrateOptionsKbps={[96, 128, 192]}
        preferredAudioBitrateKbps={128}
        appliedVideoBitrateKbps={4_500}
        appliedAudioBitrateKbps={128}
        appliedMaxOutputHeight={1080}
        onToggle={vi.fn()}
        onPlaybackRateChange={vi.fn()}
        onSubtitleFontPresetChange={vi.fn()}
        onQualityModeChange={vi.fn()}
        onPreferredVideoBitrateChange={vi.fn()}
        onPreferredAudioBitrateChange={vi.fn()}
        onPreferredResolutionChange={vi.fn()}
      />,
    );

    expect(markup).toContain('Video settings');
    expect(markup).toContain('Playback quality');
    expect(markup).toContain('Full HD');
    expect(markup).toContain('Advanced transcoding');
    expect(markup.indexOf('Playback quality')).toBeLessThan(markup.indexOf('Advanced transcoding'));
  });
});
