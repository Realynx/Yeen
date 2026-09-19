import { Injectable } from '@nestjs/common';
import { BoundedChildProcessRunner } from '../../../core/infrastructure/shared/bounded-child-process-runner';

const JOB_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function isValidUpdateJobId(value: string): boolean {
  return JOB_ID_PATTERN.test(value);
}

@Injectable()
export class UpdateHandoffService {
  private readonly runner = new BoundedChildProcessRunner(15_000);

  async launch(jobId: string): Promise<void> {
    if (!isValidUpdateJobId(jobId)) {
      throw new Error('Invalid update job identifier.');
    }

    const sudoPath =
      process.env.YEEN_UPDATE_SUDO_PATH?.trim() || '/usr/bin/sudo';
    const systemctlPath =
      process.env.YEEN_UPDATE_SYSTEMCTL_PATH?.trim() || '/bin/systemctl';
    const unitName = `yeen-update@${jobId}.service`;
    const result = await this.runner.run(sudoPath, [
      '-n',
      systemctlPath,
      'start',
      '--no-block',
      unitName,
    ]);

    if (result.exitCode !== 0) {
      const detail =
        result.stderr.trim() ||
        result.stdout.trim() ||
        `exit ${result.exitCode}`;
      throw new Error(`Update handoff failed: ${detail.slice(0, 1000)}`);
    }
  }
}
