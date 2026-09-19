import type { MediaMode } from './mediaModePreference';

const MUSIC_ROUTE_PATTERN = /^\/music(?:\/|$)/;
const VIDEO_ROUTE_PATTERN = /^\/(?:library|explore|details|player)(?:\/|$)/;

export function mediaModeForPath(pathname: string, selectedMode: MediaMode): MediaMode {
  if (MUSIC_ROUTE_PATTERN.test(pathname)) {
    return 'music';
  }

  if (VIDEO_ROUTE_PATTERN.test(pathname)) {
    return 'video';
  }

  return selectedMode;
}

export function isMediaModeRoute(pathname: string): boolean {
  return MUSIC_ROUTE_PATTERN.test(pathname) || VIDEO_ROUTE_PATTERN.test(pathname);
}

export function pathForMediaMode(mode: MediaMode): '/' | '/music' {
  return mode === 'music' ? '/music' : '/';
}
