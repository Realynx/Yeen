import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlaybackActivityService } from './playback-activity.service';
import { ProcessRestartSignalService } from './process-restart-signal.service';

export type RestartMode = 'graceful' | 'instant';
export type RestartState = 'idle' | 'draining' | 'signaling' | 'cancelled';

export interface RuntimeRestartStatus {
  id: string | null;
  mode: RestartMode | null;
  state: RestartState;
  requestedAt: string | null;
  activePlaybackCount: number;
  supervisedRestartExpected: boolean;
}

@Injectable()
export class RestartCoordinatorService implements OnModuleDestroy {
  private restart: Omit<RuntimeRestartStatus, 'activePlaybackCount'> = {
    id: null,
    mode: null,
    state: 'idle',
    requestedAt: null,
    supervisedRestartExpected: false,
  };
  private drainPoll: ReturnType<typeof setInterval> | null = null;
  private signalTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHandoff: (() => Promise<void>) | null = null;

  constructor(
    private readonly playbackActivity: PlaybackActivityService,
    private readonly processRestartSignal: ProcessRestartSignalService,
  ) {}

  request(mode: RestartMode): RuntimeRestartStatus {
    return this.start(mode, null);
  }

  requestHandoff(
    mode: RestartMode,
    handoff: () => Promise<void>,
  ): RuntimeRestartStatus {
    return this.start(mode, handoff);
  }

  private start(
    mode: RestartMode,
    handoff: (() => Promise<void>) | null,
  ): RuntimeRestartStatus {
    if (!this.isSupervisedRestartExpected()) {
      throw new ServiceUnavailableException(
        'Automatic restart is unavailable because this Yeen process is not supervised.',
      );
    }

    if (this.restart.state === 'signaling') {
      return this.getStatus();
    }

    if (this.restart.state === 'draining' && mode === 'graceful') {
      return this.getStatus();
    }

    this.clearTimers();
    this.pendingHandoff = handoff;
    this.playbackActivity.beginDrain();
    this.restart = {
      id: randomUUID(),
      mode,
      state: mode === 'instant' ? 'signaling' : 'draining',
      requestedAt: new Date().toISOString(),
      supervisedRestartExpected: this.isSupervisedRestartExpected(),
    };

    if (mode === 'instant') {
      this.scheduleCompletion();
      return this.getStatus();
    }

    this.evaluateDrain();
    if (this.restart.state === 'draining') {
      this.drainPoll = setInterval(() => this.evaluateDrain(), 1_000);
      this.drainPoll.unref?.();
    }
    return this.getStatus();
  }

  cancel(): RuntimeRestartStatus {
    if (this.restart.state !== 'draining') {
      return this.getStatus();
    }

    this.clearTimers();
    this.playbackActivity.cancelDrain();
    this.restart = {
      ...this.restart,
      state: 'cancelled',
    };
    return this.getStatus();
  }

  getStatus(): RuntimeRestartStatus {
    return {
      ...this.restart,
      supervisedRestartExpected: this.isSupervisedRestartExpected(),
      activePlaybackCount:
        this.playbackActivity.getSnapshot().activePlaybackCount,
    };
  }

  onModuleDestroy(): void {
    this.clearTimers();
  }

  private evaluateDrain(): void {
    if (this.restart.state !== 'draining') {
      return;
    }

    if (this.playbackActivity.getSnapshot().activePlaybackCount > 0) {
      return;
    }

    this.clearDrainPoll();
    this.restart = { ...this.restart, state: 'signaling' };
    this.scheduleCompletion();
  }

  private scheduleCompletion(): void {
    if (!this.pendingHandoff) {
      this.scheduleSignal();
      return;
    }

    if (this.signalTimer) return;
    this.signalTimer = setTimeout(() => {
      this.signalTimer = null;
      const handoff = this.pendingHandoff;
      this.pendingHandoff = null;
      if (!handoff) return;
      void handoff().catch(() => {
        this.playbackActivity.cancelDrain();
        this.restart = { ...this.restart, state: 'cancelled' };
      });
    }, 500);
    this.signalTimer.unref?.();
  }

  private scheduleSignal(): void {
    if (this.signalTimer) {
      return;
    }
    this.signalTimer = setTimeout(() => {
      this.signalTimer = null;
      this.processRestartSignal.requestRestart();
    }, 500);
    this.signalTimer.unref?.();
  }

  private clearTimers(): void {
    this.clearDrainPoll();
    if (this.signalTimer) {
      clearTimeout(this.signalTimer);
      this.signalTimer = null;
    }
    this.pendingHandoff = null;
  }

  private clearDrainPoll(): void {
    if (this.drainPoll) {
      clearInterval(this.drainPoll);
      this.drainPoll = null;
    }
  }

  private isSupervisedRestartExpected(): boolean {
    return process.env.YEEN_SUPERVISED_RESTART === 'true';
  }
}
