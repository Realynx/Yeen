import { formatClock, SKIP_SECONDS } from '../../services/playerUtils';
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from '../PlayerIcons';
import { VolumeIcon } from './playerVideoPanelStats';

interface PlayerControlsLeftProps {
  isPhoneMode: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipBy: (deltaSeconds: number) => void;
  onToggleMute: () => void;
  muted: boolean;
  volume: number;
  onApplyVolume: (nextVolume: number) => void;
  currentTime: number;
  totalDuration: number;
}

export function PlayerControlsLeft({
  isPhoneMode,
  isPlaying,
  onTogglePlay,
  onSkipBy,
  onToggleMute,
  muted,
  volume,
  onApplyVolume,
  currentTime,
  totalDuration,
}: PlayerControlsLeftProps) {
  return (
    <div
      className="player-controls-left"
      data-tv-focus-zone="other"
      data-tv-focus-lane-id="player-controls-left"
    >
      <button
        type="button"
        className={`player-icon-button player-icon-button-primary ${isPhoneMode ? 'is-phone-mode' : ''}`}
        data-tv-initial-focus="true"
        data-tv-focus-key="player:play-toggle"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={
          isPhoneMode
            ? (isPlaying ? 'Pause' : 'Play')
            : (isPlaying ? 'Pause (Space)' : 'Play (Space)')
        }
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {!isPhoneMode ? (
        <button
          type="button"
          className="player-icon-button"
          onClick={() => onSkipBy(-SKIP_SECONDS)}
          aria-label="Back 10 seconds"
          title="Back 10s (J)"
        >
          <SkipBackIcon />
        </button>
      ) : null}

      {!isPhoneMode ? (
        <button
          type="button"
          className="player-icon-button"
          onClick={() => onSkipBy(SKIP_SECONDS)}
          aria-label="Forward 10 seconds"
          title="Forward 10s (L)"
        >
          <SkipForwardIcon />
        </button>
      ) : null}

      <div className="player-volume-control">
        <button
          type="button"
          className="player-icon-button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={
            isPhoneMode
              ? (muted ? 'Unmute' : 'Mute')
              : (muted ? 'Unmute (M)' : 'Mute (M)')
          }
        >
          <VolumeIcon muted={muted} volume={volume} />
        </button>
        <input
          type="range"
          className="player-volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(event) => {
            onApplyVolume(Number(event.target.value));
          }}
          aria-label="Volume"
          style={{ ['--vol-fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
        />
      </div>

      <p className="player-time-readout">
        <span>{formatClock(currentTime)}</span>
        <span className="player-time-sep">/</span>
        <span>{formatClock(totalDuration)}</span>
      </p>
    </div>
  );
}
