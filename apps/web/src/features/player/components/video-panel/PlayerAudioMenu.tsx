import type { PlaybackAudioTrack } from '../../../shared/services/types';
import { CheckIcon, VolumeHighIcon } from '../PlayerIcons';

interface PlayerAudioMenuProps {
  open: boolean;
  selectedAudioStreamIndex: number | null;
  audioTracks: PlaybackAudioTrack[];
  onToggle: () => void;
  onSelectAudioTrack: (audioStreamIndex: number) => void;
  onClose: () => void;
}

export function PlayerAudioMenu({
  open,
  selectedAudioStreamIndex,
  audioTracks,
  onToggle,
  onSelectAudioTrack,
  onClose,
}: PlayerAudioMenuProps) {
  return (
    <div className="player-menu-anchor">
      <button
        type="button"
        className={`player-icon-button ${selectedAudioStreamIndex !== null ? 'is-active' : ''}`}
        onClick={onToggle}
        aria-label="Audio tracks"
        aria-expanded={open}
        title="Audio tracks"
      >
        <VolumeHighIcon />
      </button>

      {open ? (
        <div className="player-menu player-menu-unified" role="menu" aria-label="Audio tracks">
          <p className="player-menu-heading">Audio</p>

          {audioTracks.length === 0 ? (
            <p className="player-menu-empty">No alternate audio tracks detected.</p>
          ) : null}

          {audioTracks.map((track) => {
            const isSelected = selectedAudioStreamIndex === track.streamIndex;
            return (
              <button
                key={`audio-${track.streamIndex}`}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className={`player-menu-item ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  onSelectAudioTrack(track.streamIndex);
                  onClose();
                }}
              >
                <span className="player-menu-check">{isSelected ? <CheckIcon /> : null}</span>
                <span className="player-menu-label">
                  <span className="player-menu-primary">{track.label}</span>
                  <span className="player-menu-secondary">
                    {track.language ? track.language.toUpperCase() : 'unknown language'}
                    {track.codec ? ` · ${track.codec.toUpperCase()}` : ''}
                    {track.channels !== null ? ` · ${track.channels}ch` : ''}
                    {track.isDefault ? ' · default' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
