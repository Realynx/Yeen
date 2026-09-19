import {
  BoundedChildProcessRunner,
  CommandCancelledError,
  CommandTimedOutError,
} from './bounded-child-process-runner';

describe('BoundedChildProcessRunner', () => {
  it('returns output from a successful command', async () => {
    const runner = new BoundedChildProcessRunner(5000);
    const result = await runner.run(process.execPath, [
      '-e',
      'process.stdout.write("ok")',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok');
    await runner.stop();
  });

  it('times out a long-running command', async () => {
    const runner = new BoundedChildProcessRunner(100, 1000);
    await expect(
      runner.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)']),
    ).rejects.toBeInstanceOf(CommandTimedOutError);
    await runner.stop();
  });

  it('honors abort signals and rejects new work after shutdown', async () => {
    const runner = new BoundedChildProcessRunner(5000);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runner.run(process.execPath, ['-e', 'process.exit(0)'], {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(CommandCancelledError);
    await runner.stop();
    await expect(
      runner.run(process.execPath, ['-e', 'process.exit(0)']),
    ).rejects.toBeInstanceOf(CommandCancelledError);
  });
});
