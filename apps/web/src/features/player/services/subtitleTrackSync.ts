const DEFAULT_SUBTITLE_LINE_PERCENT = 87;
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
  /^(logo|intro|opening|ending|outro|op|ed|od|credits?|preview|part\s*[a-z0-9]+)$/i;
const SUBTITLE_SYNC_RETRY_DELAY_MS = 120;
const MAX_SUBTITLE_SYNC_RETRY_ATTEMPTS = 32;

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

function normalizeUrl(value: string) {
  try {
    const url = new URL(value, window.location.href);
    url.searchParams.delete('access_token');
    // Subtitle selection responses use API-relative URLs, while the rendered
    // <track> resolves them through the configured API origin. Match the
    // authenticated resource identity, not whichever web/API host resolved it.
    return `${url.pathname}${url.search}`;
  } catch {
    return value
      .replace(/([?&])access_token=[^&]+/gi, '$1')
      .replace(/[?&]$/, '');
  }
}

function normalizeOptionalUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return normalizeUrl(value);
}

function subtitleTextTracks(video: HTMLVideoElement): TextTrack[] {
  return Array.from(video.textTracks).filter(
    (track) => track.kind === 'subtitles' || track.kind === 'captions',
  );
}

function disableTracks(tracks: TextTrack[], except?: TextTrack): void {
  tracks.forEach((track) => {
    if (track !== except) track.mode = 'disabled';
  });
}

function syncVideoSubtitleTracks(video: HTMLVideoElement, activeSubtitleUrl: string | null): boolean {
  const textTracks = subtitleTextTracks(video);
  if (!activeSubtitleUrl) {
    disableTracks(textTracks);
    return true;
  }
  const normalizedActiveUrl = normalizeOptionalUrl(activeSubtitleUrl);
  const activeTrackElement = Array.from(video.querySelectorAll('track')).find((track) => {
    const src = track.getAttribute('src');
    return Boolean(src) && normalizeOptionalUrl(src) === normalizedActiveUrl;
  });
  if (!activeTrackElement) {
    disableTracks(textTracks);
    return false;
  }
  const trackToShow = activeTrackElement.track;
  disableTracks(textTracks, trackToShow);
  try {
    if (trackToShow.mode === 'disabled') trackToShow.mode = 'hidden';
    if (activeTrackElement.readyState !== 2) return false;
    normalizeTextTrackCues(trackToShow);
    trackToShow.mode = 'showing';
    return trackToShow.mode === 'showing';
  } catch {
    return false;
  }
}

export function setupSubtitleTrackSync(
  video: HTMLVideoElement,
  activeSubtitleUrl: string | null,
): () => void {
  let syncRetryTimeoutId: number | null = null;

  const clearSyncRetryTimeout = () => {
    if (syncRetryTimeoutId !== null) {
      window.clearTimeout(syncRetryTimeoutId);
      syncRetryTimeoutId = null;
    }
  };

  const syncSubtitleTracks = () => {
    return syncVideoSubtitleTracks(video, activeSubtitleUrl);
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
      trackElement.addEventListener('error', syncSubtitleTracks);
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
      trackElement.removeEventListener('error', syncSubtitleTracks);
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
}
