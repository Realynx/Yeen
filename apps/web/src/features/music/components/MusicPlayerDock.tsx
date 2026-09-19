import type { RefObject } from 'react';
import type { MediaItem } from '../../shared/services/types';
import { formatMusicDuration, musicArtist } from '../services/musicLibraryUtils';
import { MusicArtwork } from './MusicArtwork';

interface MusicPlayerDockProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  track: MediaItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  audioEvents: {
    onPlay: () => void;
    onPause: () => void;
    onTimeUpdate: () => void;
    onDurationChange: () => void;
    onEnded: () => void;
    onError: () => void;
  };
}

export function MusicPlayerDock(props: MusicPlayerDockProps) {
  const {
    audioRef,
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    error,
    onPrevious,
    onTogglePlayback,
    onNext,
    onSeek,
    onVolumeChange,
    audioEvents,
  } = props;

  return (
    <footer className="music-player-dock" aria-label="Music player">
      <audio ref={audioRef} preload="metadata" {...audioEvents} />
      <div className="music-player-now-playing">
        {track ? <MusicArtwork item={track} className="is-player-art" /> : (
          <div className="music-artwork is-player-art"><span aria-hidden="true">♫</span></div>
        )}
        <div>
          <strong>{track?.title ?? 'Choose a track'}</strong>
          <span>{track ? musicArtist(track) : 'Your music is ready when you are'}</span>
        </div>
      </div>

      <div className="music-player-center">
        <div className="music-player-controls">
          <button type="button" aria-label="Previous track" onClick={onPrevious}>‹‹</button>
          <button
            type="button"
            className="music-player-play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlayback}
          >
            {isPlaying ? 'Ⅱ' : '▶'}
          </button>
          <button type="button" aria-label="Next track" onClick={onNext}>››</button>
        </div>
        <div className="music-player-progress">
          <span>{formatMusicDuration(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(1, duration)}
            step="1"
            value={Math.min(currentTime, Math.max(1, duration))}
            aria-label="Track position"
            onChange={(event) => onSeek(Number(event.target.value))}
          />
          <span>{formatMusicDuration(duration)}</span>
        </div>
      </div>

      <div className="music-player-volume">
        <span aria-hidden="true">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          aria-label="Music volume"
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
      {error ? <p className="music-player-error" role="alert">{error}</p> : null}
    </footer>
  );
}
