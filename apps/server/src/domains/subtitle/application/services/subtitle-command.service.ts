import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  BoundedChildProcessRunner,
  type BoundedCommandOptions,
} from '../../../core/infrastructure/shared/bounded-child-process-runner';

@Injectable()
export class SubtitleCommandService implements OnModuleDestroy {
  private readonly commandRunner = new BoundedChildProcessRunner(120_000);

  async run(
    command: string,
    args: string[],
    options?: BoundedCommandOptions,
  ): Promise<string> {
    const result = await this.commandRunner.run(command, args, options);
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Command failed with code ${result.exitCode ?? 'unknown'}`,
      );
    }
    return result.stdout;
  }

  async onModuleDestroy(): Promise<void> {
    await this.commandRunner.stop();
  }
}
