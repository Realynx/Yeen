import { describe, expect, it, vi } from 'vitest';
import {
  resumePublicBroadcastHlsLoading,
  resumePublicBroadcastNativePlayback,
} from './publicBroadcastHlsRecovery';

describe('public broadcast HLS recovery', () => {
  it('restarts loading at the current clock without replacing MediaSource', () => {
    const stopLoad = vi.fn();
    const startLoad = vi.fn();

    resumePublicBroadcastHlsLoading(
      { currentTime: 42.75 },
      { stopLoad, startLoad },
    );

    expect(stopLoad).toHaveBeenCalledOnce();
    expect(startLoad).toHaveBeenCalledWith(42.75, true);
  });

  it('normalizes an unavailable playback clock before restarting', () => {
    const startLoad = vi.fn();

    resumePublicBroadcastHlsLoading(
      { currentTime: Number.NaN },
      { stopLoad: vi.fn(), startLoad },
    );

    expect(startLoad).toHaveBeenCalledWith(0, true);
  });

  it('resumes native HLS in place without reloading its media source', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const runSync = vi.fn();

    resumePublicBroadcastNativePlayback({ paused: true, play }, runSync);

    expect(runSync).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
  });
});
