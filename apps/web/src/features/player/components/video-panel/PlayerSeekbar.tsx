import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import type { MediaItem } from '../../../shared/services/types';
import { clamp, formatClock } from '../../services/playerUtils';

interface PlayerSeekbarProps {
  media: MediaItem | null;
  safeDuration: number;
  totalDuration: number;
  isSeeking: boolean;
  seekValue: number;
  currentTime: number;
  bufferedPercent: number;
  playedPercent: number;
  seekPreviewSeconds: number | null;
  onSeekTo: (seconds: number) => void;
  onSeekPreview: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onClearSeekPreview: () => void;
  onSeekInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSeekPointerDown: () => void;
  onSeekPointerUp: (event: ReactMouseEvent<HTMLInputElement>) => void;
  onSeekTouchEnd: () => void;
}

export function PlayerSeekbar({
  media,
  safeDuration,
  totalDuration,
  isSeeking,
  seekValue,
  currentTime,
  bufferedPercent,
  playedPercent,
  seekPreviewSeconds,
  onSeekTo,
  onSeekPreview,
  onClearSeekPreview,
  onSeekInputChange,
  onSeekPointerDown,
  onSeekPointerUp,
  onSeekTouchEnd,
}: PlayerSeekbarProps) {
  return (
    <div className="player-seekbar-wrap" onMouseMove={onSeekPreview} onMouseLeave={onClearSeekPreview}>
      <div className="player-seekbar-base" aria-hidden="true" />
      <div className="player-seekbar-buffered" style={{ width: `${bufferedPercent}%` }} aria-hidden="true" />
      <div className="player-seekbar-played" style={{ width: `${playedPercent}%` }} aria-hidden="true" />

      {(media?.chapterThumbnails ?? []).map((chapter, index) => {
        const markerLeft = clamp((chapter.second / safeDuration) * 100, 0, 100);
        return (
          <button
            key={`chapter-marker-${index}`}
            type="button"
            className="player-chapter-marker"
            style={{ left: `${markerLeft}%` }}
            onClick={(event) => {
              event.stopPropagation();
              onSeekTo(chapter.second);
            }}
            title={`Jump to ${formatClock(chapter.second)}`}
            aria-label={`Jump to chapter at ${formatClock(chapter.second)}`}
          />
        );
      })}

      <input
        className="player-seekbar-input"
        type="range"
        min={0}
        max={Math.max(totalDuration, 0)}
        step={0.1}
        value={isSeeking ? seekValue : currentTime}
        onChange={onSeekInputChange}
        onMouseDown={onSeekPointerDown}
        onMouseUp={onSeekPointerUp}
        onTouchStart={onSeekPointerDown}
        onTouchEnd={onSeekTouchEnd}
        aria-label="Seek video timeline"
      />

      {seekPreviewSeconds !== null ? (
        <div
          className="player-seek-preview"
          style={{ left: `${clamp((seekPreviewSeconds / safeDuration) * 100, 0, 100)}%` }}
        >
          {formatClock(seekPreviewSeconds)}
        </div>
      ) : null}
    </div>
  );
}
