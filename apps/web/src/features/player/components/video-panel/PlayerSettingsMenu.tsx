import {
  SPEED_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  toBitrateLabelKbps,
  toResolutionOptionLabel,
  type HlsLevelOption,
  type SubtitleFontPreset,
} from '../../services/playerUtils';
import { SettingsIcon } from '../PlayerIcons';
import { usePlayerMenuInitialFocus } from './usePlayerMenuInitialFocus';

function toResolutionTier(height: number): string {
  if (height >= 2160) return 'Ultra HD';
  if (height >= 1440) return 'Quad HD';
  if (height >= 1080) return 'Full HD';
  if (height >= 720) return 'HD';
  return 'SD';
}

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
  const menuRef = usePlayerMenuInitialFocus(open);

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
        <div ref={menuRef} className="player-menu player-menu-unified player-menu-settings" role="dialog" aria-label="Video settings">
          <header className="player-settings-header">
            <div>
              <p className="player-settings-eyebrow">Playback</p>
              <h3>Video settings</h3>
            </div>
            <span className={`player-settings-mode ${isHlsSource ? 'is-transcoded' : ''}`}>
              {isHlsSource ? 'Transcoded' : 'Direct play'}
            </span>
          </header>

          <div className="player-settings-scroll">
            <section className="player-settings-section" aria-labelledby="player-quality-heading">
              <div className="player-settings-section-heading">
                <div>
                  <h4 id="player-quality-heading">Playback quality</h4>
                  <p>Set the highest resolution Yeen may produce. Automatic follows server and account limits.</p>
                </div>
                <span>{preferredMaxResolutionHeight ? toResolutionOptionLabel(preferredMaxResolutionHeight) : 'Automatic'}</span>
              </div>
              <div className="player-resolution-options">
                <button
                  type="button"
                  className={`player-resolution-option ${preferredMaxResolutionHeight === null ? 'is-active' : ''}`}
                  aria-pressed={preferredMaxResolutionHeight === null}
                  data-tv-menu-initial-focus={preferredMaxResolutionHeight === null ? 'true' : undefined}
                  onClick={() => onPreferredResolutionChange(null)}
                >
                  <strong>Automatic</strong>
                  <small>Best available</small>
                </button>
                {resolutionHeightOptions.map((height) => (
                  <button
                    key={`resolution-${height}`}
                    type="button"
                    className={`player-resolution-option ${preferredMaxResolutionHeight === height ? 'is-active' : ''} ${appliedMaxOutputHeight === height ? 'is-applied' : ''}`}
                    aria-pressed={preferredMaxResolutionHeight === height}
                    data-tv-menu-initial-focus={preferredMaxResolutionHeight === height ? 'true' : undefined}
                    onClick={() => onPreferredResolutionChange(height)}
                  >
                    <strong>{toResolutionOptionLabel(height)}</strong>
                    <small>{toResolutionTier(height)}</small>
                  </button>
                ))}
              </div>
              {!isHlsSource ? (
                <p className="player-settings-note">Direct play keeps the original quality. This preference is ready if transcoding is needed.</p>
              ) : null}
            </section>

            <div className="player-settings-quick-grid">
              <section className="player-settings-section" aria-labelledby="player-speed-heading">
                <div className="player-settings-section-heading">
                  <h4 id="player-speed-heading">Speed</h4>
                  <span>{playbackRate}×</span>
                </div>
                <div className="player-menu-chiprow">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={`speed-${speed}`}
                      type="button"
                      className={`player-menu-chip ${playbackRate === speed ? 'is-active' : ''}`}
                      aria-pressed={playbackRate === speed}
                      onClick={() => onPlaybackRateChange(speed)}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>
              </section>

              <section className="player-settings-section" aria-labelledby="player-caption-style-heading">
                <div className="player-settings-section-heading">
                  <h4 id="player-caption-style-heading">Caption style</h4>
                </div>
                <div className="player-menu-chiprow">
                  {SUBTITLE_FONT_OPTIONS.map((option) => (
                    <button
                      key={`subtitle-font-${option.id}`}
                      type="button"
                      className={`player-menu-chip ${subtitleFontPreset === option.id ? 'is-active' : ''}`}
                      aria-pressed={subtitleFontPreset === option.id}
                      onClick={() => onSubtitleFontPresetChange(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {isHlsSource && hlsLevels.length > 1 ? (
              <section className="player-settings-section" aria-labelledby="player-rendition-heading">
                <div className="player-settings-section-heading">
                  <div>
                    <h4 id="player-rendition-heading">Adaptive rendition</h4>
                    <p>Choose a rendition from the active transcoded stream.</p>
                  </div>
                </div>
                <div className="player-menu-chiprow">
                  <button
                    type="button"
                    className={`player-menu-chip ${qualityMode === 'auto' ? 'is-active' : ''}`}
                    aria-pressed={qualityMode === 'auto'}
                    onClick={() => onQualityModeChange('auto')}
                  >
                    Automatic
                  </button>
                  {hlsLevels.map((level) => (
                    <button
                      key={`quality-${level.index}`}
                      type="button"
                      className={`player-menu-chip ${qualityMode === level.index ? 'is-active' : ''}`}
                      aria-pressed={qualityMode === level.index}
                      onClick={() => onQualityModeChange(level.index)}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <details className="player-settings-advanced">
              <summary>
                <span>
                  <strong>Advanced transcoding</strong>
                  <small>Bitrate limits and active profile</small>
                </span>
              </summary>

              <section className="player-transcode-profile-card" aria-label="Active transcode profile">
                <div>
                  <p className="player-transcode-profile-kicker">Account ceiling</p>
                  <p className="player-transcode-profile-value">{toBitrateLabelKbps(videoBitrateQuotaKbps)}</p>
                </div>
                <p className="player-transcode-profile-copy">
                  {isHlsSource
                    ? `Active: ${appliedMaxOutputHeight ? toResolutionOptionLabel(appliedMaxOutputHeight) : 'Auto'} · ${toBitrateLabelKbps(appliedVideoBitrateKbps)} video · ${toBitrateLabelKbps(appliedAudioBitrateKbps)} audio`
                    : 'The server applies these limits when transcoding starts.'}
                </p>
              </section>

              <p className="player-menu-heading">Video bitrate ceiling</p>
              <div className="player-menu-chiprow player-menu-chiprow-grid">
                <button
                  type="button"
                  className={`player-menu-chip ${preferredVideoBitrateKbps === null ? 'is-active' : ''}`}
                  aria-pressed={preferredVideoBitrateKbps === null}
                  onClick={() => onPreferredVideoBitrateChange(null)}
                >
                  Automatic
                </button>
                {videoBitrateOptionsKbps.map((bitrateKbps) => (
                  <button
                    key={`video-bitrate-${bitrateKbps}`}
                    type="button"
                    className={`player-menu-chip ${preferredVideoBitrateKbps === bitrateKbps ? 'is-active' : ''} ${appliedVideoBitrateKbps === bitrateKbps ? 'is-applied' : ''}`}
                    aria-pressed={preferredVideoBitrateKbps === bitrateKbps}
                    onClick={() => onPreferredVideoBitrateChange(bitrateKbps)}
                  >
                    {toBitrateLabelKbps(bitrateKbps)}
                  </button>
                ))}
              </div>

              <p className="player-menu-heading">Audio bitrate</p>
              <div className="player-menu-chiprow player-menu-chiprow-grid">
                <button
                  type="button"
                  className={`player-menu-chip ${preferredAudioBitrateKbps === null ? 'is-active' : ''}`}
                  aria-pressed={preferredAudioBitrateKbps === null}
                  onClick={() => onPreferredAudioBitrateChange(null)}
                >
                  Automatic
                </button>
                {audioBitrateOptionsKbps.map((bitrateKbps) => (
                  <button
                    key={`audio-bitrate-${bitrateKbps}`}
                    type="button"
                    className={`player-menu-chip ${preferredAudioBitrateKbps === bitrateKbps ? 'is-active' : ''} ${appliedAudioBitrateKbps === bitrateKbps ? 'is-applied' : ''}`}
                    aria-pressed={preferredAudioBitrateKbps === bitrateKbps}
                    onClick={() => onPreferredAudioBitrateChange(bitrateKbps)}
                  >
                    {toBitrateLabelKbps(bitrateKbps)}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
