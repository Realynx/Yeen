import {
  SPEED_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  toBitrateLabelKbps,
  toResolutionOptionLabel,
  type HlsLevelOption,
  type SubtitleFontPreset,
} from '../../services/playerUtils';
import { SettingsIcon } from '../PlayerIcons';

interface PlayerSettingsMenuProps {
  open: boolean;
  playbackRate: number;
  subtitleFontPreset: SubtitleFontPreset;
  videoBitrateQuotaKbps: number;
  isHlsSource: boolean;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  resolutionHeightOptions: number[];
  preferredMaxResolutionHeight: number | null;
  videoBitrateOptionsKbps: number[];
  preferredVideoBitrateKbps: number | null;
  audioBitrateOptionsKbps: number[];
  preferredAudioBitrateKbps: number | null;
  appliedVideoBitrateKbps: number | null;
  appliedAudioBitrateKbps: number | null;
  appliedMaxOutputHeight: number | null;
  onToggle: () => void;
  onPlaybackRateChange: (nextRate: number) => void;
  onSubtitleFontPresetChange: (nextSubtitleFontPreset: SubtitleFontPreset) => void;
  onQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  onPreferredVideoBitrateChange: (nextVideoBitrateKbps: number | null) => void;
  onPreferredAudioBitrateChange: (nextAudioBitrateKbps: number | null) => void;
  onPreferredResolutionChange: (nextMaxResolutionHeight: number | null) => void;
}

export function PlayerSettingsMenu({
  open,
  playbackRate,
  subtitleFontPreset,
  videoBitrateQuotaKbps,
  isHlsSource,
  hlsLevels,
  qualityMode,
  resolutionHeightOptions,
  preferredMaxResolutionHeight,
  videoBitrateOptionsKbps,
  preferredVideoBitrateKbps,
  audioBitrateOptionsKbps,
  preferredAudioBitrateKbps,
  appliedVideoBitrateKbps,
  appliedAudioBitrateKbps,
  appliedMaxOutputHeight,
  onToggle,
  onPlaybackRateChange,
  onSubtitleFontPresetChange,
  onQualityModeChange,
  onPreferredVideoBitrateChange,
  onPreferredAudioBitrateChange,
  onPreferredResolutionChange,
}: PlayerSettingsMenuProps) {
  return (
    <div className="player-menu-anchor">
      <button
        type="button"
        className="player-icon-button"
        onClick={onToggle}
        aria-label="Settings"
        aria-expanded={open}
        title="Playback settings"
      >
        <SettingsIcon />
      </button>

      {open ? (
        <div className="player-menu player-menu-unified player-menu-settings" role="menu" aria-label="Playback settings">
          <p className="player-menu-heading">Speed</p>
          <div className="player-menu-chiprow">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={`speed-${speed}`}
                type="button"
                className={`player-menu-chip ${playbackRate === speed ? 'is-active' : ''}`}
                onClick={() => onPlaybackRateChange(speed)}
              >
                {speed}×
              </button>
            ))}
          </div>

          <p className="player-menu-heading">Subtitle Font</p>
          <div className="player-menu-chiprow">
            {SUBTITLE_FONT_OPTIONS.map((option) => (
              <button
                key={`subtitle-font-${option.id}`}
                type="button"
                className={`player-menu-chip ${subtitleFontPreset === option.id ? 'is-active' : ''}`}
                onClick={() => onSubtitleFontPresetChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="player-menu-heading">Transcode Profile</p>
          <section className="player-transcode-profile-card" aria-label="Transcode profile status">
            <p className="player-transcode-profile-kicker">Video Quota Ceiling</p>
            <p className="player-transcode-profile-value">{toBitrateLabelKbps(videoBitrateQuotaKbps)}</p>
            <p className="player-transcode-profile-copy">
              {isHlsSource
                ? `Applied: ${toBitrateLabelKbps(appliedVideoBitrateKbps)} V | ${toBitrateLabelKbps(appliedAudioBitrateKbps)} A | ${appliedMaxOutputHeight ? toResolutionOptionLabel(appliedMaxOutputHeight) : 'Auto res'}`
                : 'Used automatically when transcoding starts.'}
            </p>
          </section>

          <p className="player-menu-heading">Resolution Ceiling</p>
          <div className="player-menu-chiprow player-menu-chiprow-grid">
            <button
              type="button"
              className={`player-menu-chip ${preferredMaxResolutionHeight === null ? 'is-active' : ''}`}
              onClick={() => onPreferredResolutionChange(null)}
            >
              Auto
            </button>
            {resolutionHeightOptions.map((height) => (
              <button
                key={`resolution-${height}`}
                type="button"
                className={`player-menu-chip ${preferredMaxResolutionHeight === height ? 'is-active' : ''}`}
                onClick={() => onPreferredResolutionChange(height)}
              >
                {toResolutionOptionLabel(height)}
              </button>
            ))}
          </div>

          <p className="player-menu-heading">Video Bitrate</p>
          <div className="player-menu-chiprow player-menu-chiprow-grid">
            <button
              type="button"
              className={`player-menu-chip ${preferredVideoBitrateKbps === null ? 'is-active' : ''}`}
              onClick={() => onPreferredVideoBitrateChange(null)}
            >
              Auto
            </button>
            {videoBitrateOptionsKbps.map((bitrateKbps) => (
              <button
                key={`video-bitrate-${bitrateKbps}`}
                type="button"
                className={`player-menu-chip ${preferredVideoBitrateKbps === bitrateKbps ? 'is-active' : ''}`}
                onClick={() => onPreferredVideoBitrateChange(bitrateKbps)}
              >
                {toBitrateLabelKbps(bitrateKbps)}
              </button>
            ))}
          </div>

          <p className="player-menu-heading">Audio Bitrate</p>
          <div className="player-menu-chiprow player-menu-chiprow-grid">
            <button
              type="button"
              className={`player-menu-chip ${preferredAudioBitrateKbps === null ? 'is-active' : ''}`}
              onClick={() => onPreferredAudioBitrateChange(null)}
            >
              Auto
            </button>
            {audioBitrateOptionsKbps.map((bitrateKbps) => (
              <button
                key={`audio-bitrate-${bitrateKbps}`}
                type="button"
                className={`player-menu-chip ${preferredAudioBitrateKbps === bitrateKbps ? 'is-active' : ''}`}
                onClick={() => onPreferredAudioBitrateChange(bitrateKbps)}
              >
                {toBitrateLabelKbps(bitrateKbps)}
              </button>
            ))}
          </div>

          {isHlsSource && hlsLevels.length > 0 ? (
            <>
              <p className="player-menu-heading">Quality</p>
              <div className="player-menu-chiprow">
                <button
                  type="button"
                  className={`player-menu-chip ${qualityMode === 'auto' ? 'is-active' : ''}`}
                  onClick={() => onQualityModeChange('auto')}
                >
                  Auto
                </button>
                {hlsLevels.map((level) => (
                  <button
                    key={`quality-${level.index}`}
                    type="button"
                    className={`player-menu-chip ${qualityMode === level.index ? 'is-active' : ''}`}
                    onClick={() => onQualityModeChange(level.index)}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
