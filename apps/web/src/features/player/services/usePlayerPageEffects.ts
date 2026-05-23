import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import {
  PLAYER_PREFERENCES_KEY,
  type PlayerPreferences,
} from './playerUtils';

interface UsePlayerPageEffectsOptions {
  clearControlsTimer: () => void;
  isPlaying: boolean;
  isSeeking: boolean;
  scheduleControlsAutoHide: () => void;
  volume: number;
  muted: boolean;
  playbackRate: number;
  theaterMode: boolean;
  subtitleFontPreset: PlayerPreferences['subtitleFontPreset'];
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  sourceUrl: string | null;
  activeSubtitleUrl: string | null;
  setIsFullscreen: (value: boolean) => void;
  setIsPictureInPicture: (value: boolean) => void;
  syncProgress: (completed?: boolean, keepalive?: boolean) => Promise<void>;
}

const DEFAULT_SUBTITLE_LINE_PERCENT = 87;
const PROGRESS_SYNC_INTERVAL_MS = 5000;
const ASS_ALIGNMENT_PATTERN = /\\an([1-9])/g;
const BRACE_ALIGNMENT_PATTERN = /\{=\s*(\d+)\s*\}/g;
const ASS_OVERRIDE_BLOCK_PATTERN = /\{[^{}]*\\[^{}]*\}/g;
const ASS_NEWLINE_PATTERN = /\\N|\\n/g;
const ASS_HARD_SPACE_PATTERN = /\\h/g;
const BRACE_BLOCK_PATTERN = /\{([^{}]*)\}/g;
const EMPTY_EMPHASIS_TAG_PATTERN = /<(b|i|u)>\s*<\/\1>/gi;
const TIMESTAMP_MARKER_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const INVISIBLE_CUE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const KNOWN_CUE_MARKER_PATTERN =
  /^(logo|intro|opening|ending|op|ed|credits?|preview|part\s*[a-z0-9]+)$/i;

type AssAlignment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function stripCueMarkup(rawText: string): string {
  return rawText.replace(/<[^>]+>/g, '');
}

function stripCueInvisibles(rawText: string): string {
  return rawText.replace(INVISIBLE_CUE_CHARS_PATTERN, '');
}

function isBraceOnlyCue(rawText: string): boolean {
  const withoutMarkup = stripCueMarkup(rawText).trim();
  if (!withoutMarkup) {
    return false;
  }

  return /^(?:\{[^{}]*\}\s*)+$/.test(withoutMarkup);
}

function normalizeBraceBlockContent(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return '';
  }

  if (KNOWN_CUE_MARKER_PATTERN.test(trimmed)) {
    return '';
  }

  if (TIMESTAMP_MARKER_PATTERN.test(trimmed)) {
    return '';
  }

  if (/^[=*][^{}]*$/.test(trimmed)) {
    return '';
  }

  return trimmed;
}

function parseAssAlignment(rawText: string): AssAlignment | null {
  let parsedAlignment: AssAlignment | null = null;

  for (const match of rawText.matchAll(ASS_ALIGNMENT_PATTERN)) {
    const rawValue = Number(match[1]);
    if (rawValue >= 1 && rawValue <= 9) {
      parsedAlignment = rawValue as AssAlignment;
    }
  }

  return parsedAlignment;
}

function parseBraceAlignment(rawText: string): AssAlignment | null {
  let parsedAlignment: AssAlignment | null = null;

  for (const match of rawText.matchAll(BRACE_ALIGNMENT_PATTERN)) {
    const rawValue = Number(match[1]);
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      continue;
    }

    const alignmentDigit = rawValue % 10;
    if (alignmentDigit >= 1 && alignmentDigit <= 9) {
      parsedAlignment = alignmentDigit as AssAlignment;
    }
  }

  return parsedAlignment;
}

function normalizeCueText(rawText: string): { text: string; alignment: AssAlignment | null } {
  const alignment = parseAssAlignment(rawText) ?? parseBraceAlignment(rawText);
  if (isBraceOnlyCue(rawText)) {
    return {
      text: '',
      alignment,
    };
  }

  const normalizedText = rawText
    .replace(ASS_NEWLINE_PATTERN, '\n')
    .replace(ASS_HARD_SPACE_PATTERN, ' ')
    .replace(ASS_OVERRIDE_BLOCK_PATTERN, '')
    .replace(BRACE_BLOCK_PATTERN, (_match, content: string) => normalizeBraceBlockContent(content))
    .replace(EMPTY_EMPHASIS_TAG_PATTERN, '')
    .replace(/\r/g, '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const plainText = stripCueInvisibles(stripCueMarkup(normalizedText)).trim();
  if (!plainText || KNOWN_CUE_MARKER_PATTERN.test(plainText)) {
    return {
      text: '',
      alignment,
    };
  }

  return {
    text: normalizedText,
    alignment,
  };
}

function isCueLineAuto(line: VTTCue['line']): boolean {
  return line === 'auto' || line === -1;
}

function applyDefaultCuePlacement(cue: VTTCue): void {
  if (!isCueLineAuto(cue.line)) {
    return;
  }

  cue.snapToLines = false;
  cue.line = DEFAULT_SUBTITLE_LINE_PERCENT;
  cue.lineAlign = 'center';
}

function applyAssAlignment(cue: VTTCue, alignment: AssAlignment): void {
  const horizontalPosition = alignment % 3;
  const verticalBand = alignment >= 7 ? 'top' : alignment >= 4 ? 'middle' : 'bottom';

  cue.snapToLines = false;
  cue.lineAlign = 'center';

  if (verticalBand === 'top') {
    cue.line = 9;
  } else if (verticalBand === 'middle') {
    cue.line = 50;
  } else {
    cue.line = DEFAULT_SUBTITLE_LINE_PERCENT;
  }

  if (horizontalPosition === 1) {
    cue.position = 12;
    cue.positionAlign = 'line-left';
    cue.align = 'start';
    return;
  }

  if (horizontalPosition === 2) {
    cue.position = 50;
    cue.positionAlign = 'center';
    cue.align = 'center';
    return;
  }

  cue.position = 88;
  cue.positionAlign = 'line-right';
  cue.align = 'end';
}

function normalizeTextTrackCues(textTrack: TextTrack): void {
  const cues = textTrack.cues;
  const VttCue = window.VTTCue;

  if (!cues) {
    return;
  }

  const cuesToRemove: TextTrackCue[] = [];

  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const cueWithText = cue as TextTrackCue & { text?: unknown };
    if (typeof cueWithText.text !== 'string') {
      continue;
    }

    const rawCueText = cueWithText.text;
    const normalized = normalizeCueText(rawCueText);

    if (!normalized.text) {
      cuesToRemove.push(cue);
      continue;
    }

    if (normalized.text !== rawCueText) {
      try {
        (cueWithText as TextTrackCue & { text: string }).text = normalized.text;
      } catch {
        // Ignore browser-specific readonly cue.text cases.
      }
    }

    if (!VttCue || !(cue instanceof VttCue)) {
      continue;
    }

    if (normalized.alignment !== null) {
      applyAssAlignment(cue, normalized.alignment);
      continue;
    }

    applyDefaultCuePlacement(cue);
  }

  for (const cue of cuesToRemove) {
    try {
      textTrack.removeCue(cue);
    } catch {
      // Ignore browser-specific removeCue edge cases.
    }
  }
}

export function usePlayerPageEffects({
  clearControlsTimer,
  isPlaying,
  isSeeking,
  scheduleControlsAutoHide,
  volume,
  muted,
  playbackRate,
  theaterMode,
  subtitleFontPreset,
  videoRef,
  sourceUrl,
  activeSubtitleUrl,
  setIsFullscreen,
  setIsPictureInPicture,
  syncProgress,
}: UsePlayerPageEffectsOptions): void {
  useEffect(() => {
    if (!isPlaying || isSeeking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncProgress(false);
    }, PROGRESS_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, isSeeking, syncProgress]);

  useEffect(() => {
    clearControlsTimer();

    if (isPlaying && !isSeeking) {
      scheduleControlsAutoHide();
    }
  }, [clearControlsTimer, isPlaying, isSeeking, scheduleControlsAutoHide]);

  useEffect(() => {
    return () => {
      clearControlsTimer();
    };
  }, [clearControlsTimer]);

  useEffect(() => {
    try {
      const payload: PlayerPreferences = {
        volume,
        muted,
        playbackRate,
        theaterMode,
        subtitleFontPreset,
      };

      window.localStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage persistence errors.
    }
  }, [muted, playbackRate, subtitleFontPreset, theaterMode, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.muted = muted;
    video.playbackRate = playbackRate;
  }, [muted, playbackRate, videoRef, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const SUBTITLE_SYNC_RETRY_DELAY_MS = 120;
    const MAX_SUBTITLE_SYNC_RETRY_ATTEMPTS = 32;

    const normalizeUrl = (value: string) => {
      try {
        const url = new URL(value, window.location.href);
        url.searchParams.delete('access_token');
        return url.toString();
      } catch {
        return value
          .replace(/([?&])access_token=[^&]+/gi, '$1')
          .replace(/[?&]$/, '');
      }
    };

    const normalizeOptionalUrl = (value: string | null): string | null => {
      if (!value) {
        return null;
      }

      return normalizeUrl(value);
    };

    let syncRetryTimeoutId: number | null = null;

    const clearSyncRetryTimeout = () => {
      if (syncRetryTimeoutId !== null) {
        window.clearTimeout(syncRetryTimeoutId);
        syncRetryTimeoutId = null;
      }
    };

    const syncSubtitleTracks = () => {
      const subtitleTextTracks: TextTrack[] = [];

      for (let index = 0; index < video.textTracks.length; index += 1) {
        const textTrack = video.textTracks[index];
        if (textTrack.kind === 'subtitles' || textTrack.kind === 'captions') {
          subtitleTextTracks.push(textTrack);
        }
      }

      for (const textTrack of subtitleTextTracks) {
        textTrack.mode = 'disabled';
      }

      if (!activeSubtitleUrl) {
        return true;
      }

      const trackElements = Array.from(video.querySelectorAll('track'));
      const normalizedActiveUrl = normalizeOptionalUrl(activeSubtitleUrl);

      let activeTrack: TextTrack | null = null;

      for (const trackElement of trackElements) {
        const src = trackElement.getAttribute('src');
        if (!src) {
          continue;
        }

        if (normalizeOptionalUrl(src) === normalizedActiveUrl) {
          activeTrack = trackElement.track;
          break;
        }
      }

      const fallbackTrackFromElement = trackElements[0]?.track ?? null;
      const fallbackTrack = subtitleTextTracks[0] ?? null;
      const trackToShow = activeTrack ?? fallbackTrackFromElement ?? fallbackTrack;
      if (!trackToShow) {
        return false;
      }

      try {
        trackToShow.mode = 'hidden';
        normalizeTextTrackCues(trackToShow);
        trackToShow.mode = 'showing';
        return trackToShow.mode === 'showing';
      } catch {
        return false;
      }
    };

    const scheduleSubtitleSyncRetry = (attempt: number) => {
      if (!activeSubtitleUrl || attempt >= MAX_SUBTITLE_SYNC_RETRY_ATTEMPTS) {
        return;
      }

      const retryDelayMs = SUBTITLE_SYNC_RETRY_DELAY_MS * Math.min(4, attempt + 1);
      clearSyncRetryTimeout();
      syncRetryTimeoutId = window.setTimeout(() => {
        syncRetryTimeoutId = null;
        const didSync = syncSubtitleTracks();
        if (!didSync) {
          scheduleSubtitleSyncRetry(attempt + 1);
        }
      }, retryDelayMs);
    };

    const registeredTrackElements = new Set<HTMLTrackElement>();

    const handleTrackMutation = () => {
      const trackElements = Array.from(video.querySelectorAll('track'));
      for (const trackElement of trackElements) {
        if (registeredTrackElements.has(trackElement)) {
          continue;
        }

        trackElement.addEventListener('load', syncSubtitleTracks);
        registeredTrackElements.add(trackElement);
      }

      const didSync = syncSubtitleTracks();
      if (didSync) {
        clearSyncRetryTimeout();
        return;
      }

      if (activeSubtitleUrl) {
        scheduleSubtitleSyncRetry(0);
      }
    };

    handleTrackMutation();
    video.textTracks.addEventListener('addtrack', handleTrackMutation);
    video.textTracks.addEventListener('removetrack', handleTrackMutation);
    video.addEventListener('loadedmetadata', handleTrackMutation);
    video.addEventListener('loadeddata', handleTrackMutation);
    video.addEventListener('canplay', handleTrackMutation);
    video.addEventListener('play', handleTrackMutation);
    video.addEventListener('playing', handleTrackMutation);
    video.addEventListener('seeked', handleTrackMutation);

    return () => {
      clearSyncRetryTimeout();

      for (const trackElement of registeredTrackElements) {
        trackElement.removeEventListener('load', syncSubtitleTracks);
      }

      video.textTracks.removeEventListener('addtrack', handleTrackMutation);
      video.textTracks.removeEventListener('removetrack', handleTrackMutation);
      video.removeEventListener('loadedmetadata', handleTrackMutation);
      video.removeEventListener('loadeddata', handleTrackMutation);
      video.removeEventListener('canplay', handleTrackMutation);
      video.removeEventListener('play', handleTrackMutation);
      video.removeEventListener('playing', handleTrackMutation);
      video.removeEventListener('seeked', handleTrackMutation);
    };
  }, [activeSubtitleUrl, sourceUrl, videoRef]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handlePiPChange = () => {
      setIsPictureInPicture(Boolean(document.pictureInPictureElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('enterpictureinpicture', handlePiPChange);
    document.addEventListener('leavepictureinpicture', handlePiPChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('enterpictureinpicture', handlePiPChange);
      document.removeEventListener('leavepictureinpicture', handlePiPChange);
    };
  }, [setIsFullscreen, setIsPictureInPicture]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }

      void syncProgress(false, true);
    };

    const handlePageHide = () => {
      void syncProgress(false, true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [syncProgress]);

  useEffect(() => {
    return () => {
      void syncProgress(false, true);
    };
  }, [syncProgress]);
}
