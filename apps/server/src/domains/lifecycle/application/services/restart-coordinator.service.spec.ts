import { PlaybackActivityService } from './playback-activity.service';
import { ProcessRestartSignalService } from './process-restart-signal.service';
import { RestartCoordinatorService } from './restart-coordinator.service';

describe('RestartCoordinatorService', () => {
  let originalSupervision: string | undefined;

  beforeEach(() => {
    originalSupervision = process.env.YEEN_SUPERVISED_RESTART;
    process.env.YEEN_SUPERVISED_RESTART = 'true';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (typeof originalSupervision === 'undefined') {
      delete process.env.YEEN_SUPERVISED_RESTART;
    } else {
      process.env.YEEN_SUPERVISED_RESTART = originalSupervision;
    }
  });

  it('refuses to stop an unsupervised process', () => {
    process.env.YEEN_SUPERVISED_RESTART = 'false';
    const activity = new PlaybackActivityService();
    const requestRestart = jest.fn();
    const signal = {
      requestRestart,
    } as unknown as ProcessRestartSignalService;
    const coordinator = new RestartCoordinatorService(activity, signal);

    expect(() => coordinator.request('instant')).toThrow(
      'this Yeen process is not supervised',
    );
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it('waits for active playback before a graceful restart', () => {
    jest.useFakeTimers();
    const activity = new PlaybackActivityService();
    activity.touch('hls:one');
    const requestRestart = jest.fn();
    const signal = {
      requestRestart,
    } as unknown as ProcessRestartSignalService;
    const coordinator = new RestartCoordinatorService(activity, signal);

    expect(coordinator.request('graceful')).toMatchObject({
      state: 'draining',
      activePlaybackCount: 1,
    });
    jest.advanceTimersByTime(14_000);
    expect(requestRestart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    jest.advanceTimersByTime(500);
    expect(requestRestart).toHaveBeenCalledTimes(1);
    coordinator.onModuleDestroy();
  });

  it('allows instant restart to override graceful draining', () => {
    jest.useFakeTimers();
    const activity = new PlaybackActivityService();
    activity.touch('direct:one');
    const requestRestart = jest.fn();
    const signal = {
      requestRestart,
    } as unknown as ProcessRestartSignalService;
    const coordinator = new RestartCoordinatorService(activity, signal);

    coordinator.request('graceful');
    expect(coordinator.request('instant').state).toBe('signaling');
    jest.advanceTimersByTime(500);
    expect(requestRestart).toHaveBeenCalledTimes(1);
    coordinator.onModuleDestroy();
  });

  it('hands a graceful update to an external service after Playback drains', async () => {
    jest.useFakeTimers();
    const activity = new PlaybackActivityService();
    activity.touch('hls:update');
    const requestRestart = jest.fn();
    const signal = {
      requestRestart,
    } as unknown as ProcessRestartSignalService;
    const coordinator = new RestartCoordinatorService(activity, signal);
    const handoff = jest.fn().mockResolvedValue(undefined);

    expect(coordinator.requestHandoff('graceful', handoff).state).toBe(
      'draining',
    );
    jest.advanceTimersByTime(16_000);
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(handoff).toHaveBeenCalledTimes(1);
    expect(requestRestart).not.toHaveBeenCalled();
    coordinator.onModuleDestroy();
  });

  it('cancels a pending graceful restart and accepts playback again', () => {
    const activity = new PlaybackActivityService();
    activity.touch('hls:one');
    const signal = {
      requestRestart: jest.fn(),
    } as unknown as ProcessRestartSignalService;
    const coordinator = new RestartCoordinatorService(activity, signal);

    coordinator.request('graceful');
    expect(coordinator.cancel().state).toBe('cancelled');
    expect(() => activity.assertCanStartPlayback()).not.toThrow();
    coordinator.onModuleDestroy();
  });
});
