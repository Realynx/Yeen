import type { RefObject } from 'react';
import { CheckIcon } from '../PlayerIcons';
import type { PlayerContextMenuState } from './PlayerVideoPanel.types';

interface PlayerContextMenuProps {
  contextMenu: PlayerContextMenuState | null;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  muted: boolean;
  isPhoneMode: boolean;
  theaterMode: boolean;
  canUsePictureInPicture: boolean;
  isPictureInPicture: boolean;
  canCast: boolean;
  isCasting: boolean;
  isFullscreen: boolean;
  showNerdStats: boolean;
  onRunAction: (action: () => void) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onToggleTheaterMode: () => void;
  onTogglePictureInPicture: () => void;
  onOpenCastPicker: () => void;
  onToggleFullscreen: () => void;
  onToggleNerdStats: () => void;
}

export function PlayerContextMenu({
  contextMenu,
  contextMenuRef,
  isPlaying,
  muted,
  isPhoneMode,
  theaterMode,
  canUsePictureInPicture,
  isPictureInPicture,
  canCast,
  isCasting,
  isFullscreen,
  showNerdStats,
  onRunAction,
  onTogglePlay,
  onToggleMute,
  onToggleTheaterMode,
  onTogglePictureInPicture,
  onOpenCastPicker,
  onToggleFullscreen,
  onToggleNerdStats,
}: PlayerContextMenuProps) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div
      ref={contextMenuRef}
      className="player-context-menu player-menu player-menu-unified"
      role="menu"
      aria-label="Player options"
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="player-menu-heading">Player</p>

      <button
        type="button"
        role="menuitem"
        className="player-menu-item"
        onClick={() => onRunAction(onTogglePlay)}
      >
        <span className="player-menu-label">
          <span className="player-menu-primary">{isPlaying ? 'Pause' : 'Play'}</span>
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="player-menu-item"
        onClick={() => onRunAction(onToggleMute)}
      >
        <span className="player-menu-label">
          <span className="player-menu-primary">{muted ? 'Unmute' : 'Mute'}</span>
        </span>
      </button>

      {!isPhoneMode ? (
        <button
          type="button"
          role="menuitem"
          className="player-menu-item"
          onClick={() => onRunAction(onToggleTheaterMode)}
        >
          <span className="player-menu-label">
            <span className="player-menu-primary">{theaterMode ? 'Exit theater mode' : 'Enter theater mode'}</span>
          </span>
        </button>
      ) : null}

      {canUsePictureInPicture ? (
        <button
          type="button"
          role="menuitem"
          className="player-menu-item"
          onClick={() => onRunAction(onTogglePictureInPicture)}
        >
          <span className="player-menu-label">
            <span className="player-menu-primary">{isPictureInPicture ? 'Exit picture-in-picture' : 'Picture-in-picture'}</span>
          </span>
        </button>
      ) : null}

      {canCast ? (
        <button
          type="button"
          role="menuitem"
          className="player-menu-item"
          onClick={() => onRunAction(onOpenCastPicker)}
        >
          <span className="player-menu-label">
            <span className="player-menu-primary">{isCasting ? 'Casting to device' : 'Cast to device'}</span>
          </span>
        </button>
      ) : null}

      <button
        type="button"
        role="menuitem"
        className="player-menu-item"
        onClick={() => onRunAction(onToggleFullscreen)}
      >
        <span className="player-menu-label">
          <span className="player-menu-primary">{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</span>
        </span>
      </button>

      <div className="player-context-menu-separator" aria-hidden="true" />

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showNerdStats}
        className={`player-menu-item ${showNerdStats ? 'is-active' : ''}`}
        onClick={() => onRunAction(onToggleNerdStats)}
      >
        <span className="player-menu-check" aria-hidden="true">
          {showNerdStats ? <CheckIcon /> : null}
        </span>
        <span className="player-menu-label">
          <span className="player-menu-primary">Stats for Nerds</span>
        </span>
      </button>
    </div>
  );
}
