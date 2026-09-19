import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ProcessRestartSignalService {
  private readonly logger = new Logger(ProcessRestartSignalService.name);

  requestRestart(): void {
    this.logger.warn('Requesting supervised Yeen restart with SIGTERM.');
    process.kill(process.pid, 'SIGTERM');
  }
}
