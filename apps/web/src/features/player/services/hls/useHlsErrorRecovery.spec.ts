import Hls, { type ErrorData } from 'hls.js';
import { describe, expect, it, vi } from 'vitest';
import { attachHlsErrorRecovery } from './useHlsErrorRecovery';

describe('attachHlsErrorRecovery', () => {
  it('terminates immediately when the server reports a permanent transcode failure', () => {
    let errorHandler: ((event: string, data: ErrorData) => void) | null = null;
    const hls = {
      on: vi.fn((event: string, handler: (event: string, data: ErrorData) => void) => {
        if (event === Hls.Events.ERROR) errorHandler = handler;
      }),
      destroy: vi.fn(),
      startLoad: vi.fn(),
      recoverMediaError: vi.fn(),
    } as unknown as Hls;
    const restartHlsSession = vi.fn().mockResolvedValue(true);
    const setPlayerError = vi.fn();
    const clearHlsRef = vi.fn();

    attachHlsErrorRecovery({
      hls,
      restartHlsSession,
      setPlayerError,
      clearHlsRef,
    });

    expect(errorHandler).not.toBeNull();
    (errorHandler as unknown as (event: string, data: ErrorData) => void)(
      Hls.Events.ERROR,
      {
        fatal: false,
        type: Hls.ErrorTypes.NETWORK_ERROR,
        response: {
          code: 422,
          data: undefined,
          text: '',
          url: '/api/stream/hls/session/segment_00000.ts',
        },
      } as ErrorData,
    );

    expect(setPlayerError).toHaveBeenCalledWith(
      'This media could not be transcoded. Ask an administrator to check its codec or transcoding settings.',
    );
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(clearHlsRef).toHaveBeenCalledTimes(1);
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(restartHlsSession).not.toHaveBeenCalled();
  });
});
