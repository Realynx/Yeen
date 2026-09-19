interface VideoBufferingState {
  paused: boolean;
  ended: boolean;
}

export function shouldShowBufferingForVideoState(
  video: VideoBufferingState | null,
): boolean {
  return Boolean(video && !video.paused && !video.ended);
}
