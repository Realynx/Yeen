import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

@Injectable()
export class SubtitleCommandService {
  run(command: string, args: string[]): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(command, args, { windowsHide: true });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        rejectPromise(error);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          rejectPromise(
            new Error(stderr.trim() || `Command failed with code ${code}`),
          );
          return;
        }

        resolvePromise(stdout);
      });
    });
  }
}
