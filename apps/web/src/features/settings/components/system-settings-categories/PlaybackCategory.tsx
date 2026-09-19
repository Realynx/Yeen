import type { SystemSettings } from "../../../shared/services/types";
import type { SystemSettingsState } from "../../services/useSystemSettings";
import { SettingsCategorySection } from "./SettingsCategorySection";

interface PlaybackCategoryProps {
  systemSettings: SystemSettings;
  updateSetting: SystemSettingsState["updateSetting"];
  isOpen: boolean;
  onToggle: () => void;
}

export function PlaybackCategory({
  systemSettings,
  updateSetting,
  isOpen,
  onToggle,
}: PlaybackCategoryProps) {
  const videoBitrateKbps = Math.max(
    250,
    Math.round(systemSettings.transcodeDefaultMaxBitrateKbps || 0),
  );
  const audioBitrateKbps = Math.max(
    48,
    Math.round(systemSettings.transcodeAudioBitrateKbps || 0),
  );
  const estimatedMaxThroughputKbps = videoBitrateKbps + audioBitrateKbps;
  const estimatedMaxThroughputMbps = estimatedMaxThroughputKbps / 1000;
  const estimatedMaxThroughputLabel =
    estimatedMaxThroughputMbps >= 10
      ? estimatedMaxThroughputMbps.toFixed(1)
      : estimatedMaxThroughputMbps.toFixed(2);

  return (
    <SettingsCategorySection
      id="system-transcoding"
      kicker="Playback"
      title="Transcoding & Throughput"
      description="Tune stream quality and network behavior defaults used by new HLS sessions."
      badge="Stream Pipeline"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="system-settings-form">
        <div className="settings-field settings-field-wide" aria-live="polite">
          <span
            className="settings-field-label"
            title="Estimated per-stream network ceiling based on configured video and audio bitrate caps."
          >
            Estimated Max Throughput (Per Stream)
          </span>
          <p className="settings-inline-meta">
            <strong>{estimatedMaxThroughputLabel} Mbps</strong>
            <span>
              Video {videoBitrateKbps.toLocaleString()} kbps + Audio{" "}
              {audioBitrateKbps.toLocaleString()} kbps
            </span>
          </p>
          <small className="settings-field-hint">
            Updates live as you edit bitrate settings. Account-specific bitrate
            overrides can further lower the effective stream cap.
          </small>
        </div>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Select automatic GPU detection, require NVIDIA NVENC when available, or force CPU transcoding."
          >
            Hardware Acceleration
          </span>
          <select
            value={systemSettings.transcodeHardwareAcceleration}
            onChange={(event) =>
              updateSetting(
                "transcodeHardwareAcceleration",
                event.target.value as "auto" | "nvidia" | "cpu",
              )
            }
          >
            <option value="auto">Automatic (prefer NVIDIA)</option>
            <option value="nvidia">NVIDIA NVENC</option>
            <option value="cpu">CPU (libx264)</option>
          </select>
          <small className="settings-field-hint">
            Automatic uses CUDA decode and scaling with NVENC when its runtime
            probe succeeds, otherwise it safely falls back to CPU.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Encoder speed profile. Faster presets use less CPU but may need more bitrate for similar quality."
          >
            Transcode Preset
          </span>
          <input
            type="text"
            value={systemSettings.transcodePreset}
            onChange={(event) =>
              updateSetting("transcodePreset", event.target.value)
            }
            placeholder="veryfast"
          />
          <small className="settings-field-hint">
            Typical values: ultrafast, veryfast, medium.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Constant Rate Factor target. Lower CRF increases visual quality and output bitrate; higher CRF reduces bitrate at lower quality."
          >
            Transcode CRF (12-40)
          </span>
          <input
            type="number"
            min={12}
            max={40}
            value={systemSettings.transcodeCrf}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "transcodeCrf",
                Number.isFinite(parsed) ? parsed : 22,
              );
            }}
          />
          <small className="settings-field-hint">
            Lower values improve quality but require more bandwidth.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Default video bitrate ceiling for transcoded streams. Used when an account does not have a custom max bitrate override."
          >
            Default Max Bitrate (kbps)
          </span>
          <input
            type="number"
            min={250}
            max={50000}
            value={systemSettings.transcodeDefaultMaxBitrateKbps}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "transcodeDefaultMaxBitrateKbps",
                Number.isFinite(parsed) ? parsed : 4500,
              );
            }}
          />
          <small className="settings-field-hint">
            Used as the default per-account bitrate cap unless that account has
            a custom override.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="AAC audio bitrate target for transcoded streams. Lower values save bandwidth; higher values improve audio fidelity."
          >
            Audio Bitrate (kbps)
          </span>
          <input
            type="number"
            min={48}
            max={384}
            value={systemSettings.transcodeAudioBitrateKbps}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "transcodeAudioBitrateKbps",
                Number.isFinite(parsed) ? parsed : 160,
              );
            }}
          />
          <small className="settings-field-hint">
            Lower audio bitrate can reduce total stream throughput.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Maximum output video height. The server scales down to this limit while preserving aspect ratio, reducing bandwidth and decode load."
          >
            Max Output Height (px)
          </span>
          <input
            type="number"
            min={240}
            max={2160}
            step={1}
            value={systemSettings.transcodeMaxOutputHeight}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "transcodeMaxOutputHeight",
                Number.isFinite(parsed) ? parsed : 1080,
              );
            }}
          />
          <small className="settings-field-hint">
            Output is scaled to this height cap while preserving aspect ratio.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="x264 VBV buffer window used with max bitrate. Larger values smooth quality during motion-heavy scenes but allow larger short-term bursts."
          >
            Rate Control Buffer (seconds)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={systemSettings.transcodeRateControlBufferSeconds}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "transcodeRateControlBufferSeconds",
                Number.isFinite(parsed) ? parsed : 3,
              );
            }}
          />
          <small className="settings-field-hint">
            Larger buffers can smooth transient spikes but increase burst size.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Duration of each HLS segment. Shorter segments improve startup and seek responsiveness; longer segments reduce request overhead."
          >
            HLS Segment Seconds (1-20)
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={systemSettings.hlsSegmentSeconds}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateSetting(
                "hlsSegmentSeconds",
                Number.isFinite(parsed) ? parsed : 4,
              );
            }}
          />
          <small className="settings-field-hint">
            Shorter segments can improve scrubbing and startup latency.
          </small>
        </label>

        <label className="settings-field">
          <span
            className="settings-field-label"
            title="Preferred subtitle language code for automatic subtitle selection and lookup defaults (for example: en, es, ja)."
          >
            Subtitle Language
          </span>
          <input
            type="text"
            value={systemSettings.subtitleDefaultLanguage}
            onChange={(event) =>
              updateSetting("subtitleDefaultLanguage", event.target.value)
            }
            placeholder="en"
          />
          <small className="settings-field-hint">
            Preferred ISO language code used for subtitle lookups.
          </small>
        </label>
      </div>
    </SettingsCategorySection>
  );
}
