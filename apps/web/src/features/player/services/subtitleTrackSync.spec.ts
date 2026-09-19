import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSubtitleTrackSync } from './subtitleTrackSync';

class FakeTextTrackList extends EventTarget {
  [index: number]: TextTrack;
  length = 0;

  add(track: TextTrack): void {
    this[this.length] = track;
    this.length += 1;
  }
}

function createTextTrack(): TextTrack {
  return {
    kind: 'subtitles',
    mode: 'disabled',
    cues: null,
  } as TextTrack;
}

function createTrackElement(src: string, track: TextTrack, readyState = 2): HTMLTrackElement {
  const events = new EventTarget();

  return {
    track,
    readyState,
    getAttribute: (name: string) => (name === 'src' ? src : null),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as HTMLTrackElement;
}

function createBrowserLoadingTrack(src: string): {
  element: HTMLTrackElement;
  track: TextTrack;
} {
  const events = new EventTarget();
  let mode: TextTrackMode = 'disabled';
  let readyState = 0;
  let loadTimer: ReturnType<typeof setTimeout> | null = null;

  const element = {
    get readyState() {
      return readyState;
    },
    getAttribute: (name: string) => (name === 'src' ? src : null),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as HTMLTrackElement;

  const track = {
    kind: 'subtitles',
    cues: null,
    get mode() {
      return mode;
    },
    set mode(value: TextTrackMode) {
      mode = value;
      if (value === 'disabled') {
        readyState = 0;
        if (loadTimer !== null) {
          clearTimeout(loadTimer);
          loadTimer = null;
        }
        return;
      }

      if (readyState === 0 && loadTimer === null) {
        readyState = 1;
        loadTimer = setTimeout(() => {
          loadTimer = null;
          readyState = 2;
          events.dispatchEvent(new Event('load'));
        }, 20);
      }
    },
  } as TextTrack;

  Object.defineProperty(element, 'track', { value: track });
  return { element, track };
}

function createVideo(
  textTracks: TextTrack[],
  trackElements: HTMLTrackElement[],
): HTMLVideoElement {
  const events = new EventTarget();
  const trackList = new FakeTextTrackList();
  textTracks.forEach((track) => trackList.add(track));

  return {
    textTracks: trackList,
    querySelectorAll: (selector: string) => selector === 'track' ? trackElements : [],
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as HTMLVideoElement;
}

describe('setupSubtitleTrackSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      location: { href: 'https://yeen.test/player/media-1' },
      setTimeout,
      clearTimeout,
      VTTCue: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show a stale track while the requested language track is absent', () => {
    const staleTrack = createTextTrack();
    const video = createVideo(
      [staleTrack],
      [createTrackElement('/subtitles/en.vtt?access_token=old', staleTrack)],
    );

    const cleanup = setupSubtitleTrackSync(
      video,
      '/subtitles/ja.vtt?access_token=new',
    );

    expect(staleTrack.mode).toBe('disabled');
    cleanup();
  });

  it('waits for the requested track to load before reporting it as showing', () => {
    const requestedTrack = createTextTrack();
    const video = createVideo(
      [requestedTrack],
      [createTrackElement('/subtitles/ja.vtt', requestedTrack, 1)],
    );

    const cleanup = setupSubtitleTrackSync(video, '/subtitles/ja.vtt');

    expect(requestedTrack.mode).not.toBe('showing');
    cleanup();
  });

  it('keeps the requested track loading across synchronization retries', async () => {
    const requested = createBrowserLoadingTrack('/subtitles/ja.vtt');
    const video = createVideo([requested.track], [requested.element]);

    const cleanup = setupSubtitleTrackSync(video, '/subtitles/ja.vtt');
    await vi.advanceTimersByTimeAsync(200);

    expect(requested.element.readyState).toBe(2);
    expect(requested.track.mode).toBe('showing');
    cleanup();
  });

  it('does not disable a loaded track when the API and player use different origins', () => {
    const requestedTrack = createTextTrack();
    requestedTrack.mode = 'showing';
    const video = createVideo(
      [requestedTrack],
      [createTrackElement(
        'http://localhost:4000/api/subtitles/file/media-1/ja.vtt?access_token=secret',
        requestedTrack,
      )],
    );

    const cleanup = setupSubtitleTrackSync(
      video,
      '/api/subtitles/file/media-1/ja.vtt?access_token=secret',
    );

    expect(requestedTrack.mode).toBe('showing');
    cleanup();
  });
});
