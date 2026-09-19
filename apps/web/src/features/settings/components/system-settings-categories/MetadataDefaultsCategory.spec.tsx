import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SystemSettings } from '../../../shared/services/types';
import { MetadataDefaultsCategory } from './MetadataDefaultsCategory';

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

describe('MetadataDefaultsCategory TheAudioDB settings', () => {
  it('shows the free-key default and a redacted custom-key status', () => {
    const markup = renderToStaticMarkup(
      <MetadataDefaultsCategory
        systemSettings={settings}
        updateSetting={vi.fn()}
        isOpen
        onToggle={vi.fn()}
      />,
    );

    expect(markup).toContain('TheAudioDB Music Metadata');
    expect(markup).toContain('default free API access');
    expect(markup).toContain('A custom key is stored securely');
    expect(markup).toContain('Clear the saved custom key');
    expect(markup).not.toContain('new-premium-key');
  });
});
