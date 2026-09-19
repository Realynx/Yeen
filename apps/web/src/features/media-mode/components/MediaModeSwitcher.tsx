import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useMediaMode } from '../services/MediaModeContext';
import {
  mediaModeForPath,
  pathForMediaMode,
} from '../services/mediaModeRouting';
import type { MediaMode } from '../services/mediaModePreference';

const HIDDEN_ROUTE_PATTERN = /^\/(player|watch)\//;

function VideoModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path className="media-mode-play-glyph" d="m10 9 5 3-5 3Z" />
    </svg>
  );
}

function MusicModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 17.5V6.8l9-2v10.7" />
      <path d="M9 9.5 18 7.5" />
      <ellipse cx="6.5" cy="17.5" rx="2.5" ry="2" />
      <ellipse cx="15.5" cy="15.5" rx="2.5" ry="2" />
    </svg>
  );
}

export type MediaModeSwitcherPlacement =
  | 'top-nav'
  | 'phone-header'
  | 'music-header';

interface MediaModeControlProps {
  mode: MediaMode;
  placement: MediaModeSwitcherPlacement;
  onSelect: (mode: MediaMode) => void;
}

export function MediaModeSwitchSlot({
  placement,
}: {
  placement: MediaModeSwitcherPlacement;
}) {
  const { mode, setMode } = useMediaMode();
  const location = useLocation();
  const navigate = useNavigate();

  if (HIDDEN_ROUTE_PATTERN.test(location.pathname)) {
    return null;
  }

  const presentedMode = mediaModeForPath(location.pathname, mode);

  function selectMode(nextMode: MediaMode) {
    setMode(nextMode);
    navigate(pathForMediaMode(nextMode), { replace: true });
  }

  return (
    <div
      className="media-mode-switcher-slot"
      data-media-mode-switcher-slot={placement}
      data-tv-focus-lane-id="media-mode"
    >
      <MediaModeControl
        mode={presentedMode}
        placement={placement}
        onSelect={selectMode}
      />
    </div>
  );
}

export function MediaModeControl({ mode, placement, onSelect }: MediaModeControlProps) {
  return (
    <div
      className="media-mode-switcher"
      data-mode={mode}
      data-placement={placement}
      role="group"
      aria-label="Media library mode"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={mode === 'video' ? 'is-active' : ''}
        aria-pressed={mode === 'video'}
        aria-label="Open Video library"
        title="Video library"
        data-tv-focus-key="media-mode-video"
        onClick={() => onSelect('video')}
      >
        <span className="media-mode-switcher-icon"><VideoModeIcon /></span>
        <span className="media-mode-switcher-label">Video</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={mode === 'music' ? 'is-active' : ''}
        aria-pressed={mode === 'music'}
        aria-label="Open Music library"
        title="Music library"
        data-tv-focus-key="media-mode-music"
        onClick={() => onSelect('music')}
      >
        <span className="media-mode-switcher-icon"><MusicModeIcon /></span>
        <span className="media-mode-switcher-label">Music</span>
      </Button>
    </div>
  );
}

export function MediaModeSwitcher() {
  return null;
}
