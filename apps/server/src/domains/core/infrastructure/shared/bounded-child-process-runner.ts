import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { basename } from 'node:path';

export interface BoundedCommandOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BoundedCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export class CommandTimedOutError extends Error {
  constructor(
    readonly command: string,
    readonly timeoutMs: number,
  ) {
    super(`${basename(command)} timed out after ${timeoutMs}ms.`);
    this.name = 'CommandTimedOutError';
  }
}

export class CommandCancelledError extends Error {
  constructor(readonly command: string) {
    super(`${basename(command)} was cancelled.`);
    this.name = 'CommandCancelledError';
  }
}

interface ActiveCommand {
  promise: Promise<BoundedCommandResult>;
  cancel: (reason: Error) => void;
}

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 256 * 1024;

export class BoundedChildProcessRunner {
  private readonly activeCommands = new Set<ActiveCommand>();
  private stopping = false;

  constructor(
    private readonly defaultTimeoutMs: number,
    private readonly terminationGraceMs = 5000,
  ) {}

  run(
    command: string,
    args: readonly string[],
    options: BoundedCommandOptions = {},
  ): Promise<BoundedCommandResult> {
    if (this.stopping || options.signal?.aborted) {
      return Promise.reject(new CommandCancelledError(command));
    }

    const timeoutMs = this.normalizeTimeout(options.timeoutMs);
    let cancelCommand: (reason: Error) => void = () => {
      // Replaced synchronously during promise construction.
    };
    const active: ActiveCommand = {
      promise: Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
      }),
      cancel: (reason) => cancelCommand(reason),
    };

    const promise = new Promise<BoundedCommandResult>((resolve, reject) => {
      const child = spawn(command, [...args], {
        windowsHide: true,
        shell: false,
        detached: process.platform !== 'win32',
      });
      let stdout = '';
      let stderr = '';
      let terminalError: Error | null = null;
      let settled = false;
      let terminationTimer: NodeJS.Timeout | null = null;

      const timeout = setTimeout(() => {
        beginTermination(new CommandTimedOutError(command, timeoutMs));
      }, timeoutMs);
      timeout.unref?.();

      const cleanup = () => {
        clearTimeout(timeout);
        if (terminationTimer) {
          clearTimeout(terminationTimer);
          terminationTimer = null;
        }
        options.signal?.removeEventListener('abort', handleAbort);
      };

      const settle = (action: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        action();
      };

      const beginTermination = (reason: Error) => {
        if (settled) {
          return;
        }
        terminalError ??= reason;
        this.terminateProcessTree(child);
        if (!terminationTimer) {
          terminationTimer = setTimeout(() => {
            child.stdout.destroy();
            child.stderr.destroy();
            settle(() =>
              reject(terminalError ?? new CommandCancelledError(command)),
            );
          }, this.terminationGraceMs);
          terminationTimer.unref?.();
        }
      };

      const handleAbort = () => {
        beginTermination(new CommandCancelledError(command));
      };

      cancelCommand = beginTermination;
      options.signal?.addEventListener('abort', handleAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdout.length >= MAX_STDOUT_BYTES) {
          return;
        }
        stdout = `${stdout}${chunk.toString()}`.slice(0, MAX_STDOUT_BYTES);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-MAX_STDERR_BYTES);
      });

      child.once('error', (error) => {
        terminalError ??= error;
        settle(() => reject(terminalError ?? error));
      });

      child.once('close', (exitCode, signal) => {
        settle(() => {
          if (terminalError) {
            reject(terminalError);
            return;
          }
          resolve({ stdout, stderr, exitCode, signal });
        });
      });
    }).finally(() => {
      this.activeCommands.delete(active);
    });

    active.promise = promise;
    this.activeCommands.add(active);
    return promise;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const active = [...this.activeCommands];
    for (const command of active) {
      command.cancel(new CommandCancelledError('command'));
    }
    await Promise.allSettled(active.map((command) => command.promise));
  }

  private normalizeTimeout(timeoutMs: number | undefined): number {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) {
      return this.defaultTimeoutMs;
    }
    return Math.max(100, Math.round(timeoutMs));
  }

  private terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
    if (!child.pid) {
      this.killDirectChild(child);
      return;
    }

    if (process.platform === 'win32') {
      try {
        const killer = spawn(
          'taskkill.exe',
          ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' },
        );
        const fallback = () => this.killDirectChild(child);
        killer.once('error', fallback);
        killer.once('close', (code) => {
          if (code !== 0) {
            fallback();
          }
        });
      } catch {
        this.killDirectChild(child);
      }
      return;
    }

    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      this.killDirectChild(child);
    }
  }

  private killDirectChild(child: ChildProcessWithoutNullStreams): void {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process may already have exited.
    }
  }
}
