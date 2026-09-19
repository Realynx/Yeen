import type { MediaItem } from '../../shared/services/types';

export function withAuthoritativePlaybackDuration(
  media: MediaItem | null,
  durationSeconds: number | null,
): MediaItem | null {
  if (
    !media ||
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return media;
  }

  return { ...media, durationSeconds };
}
