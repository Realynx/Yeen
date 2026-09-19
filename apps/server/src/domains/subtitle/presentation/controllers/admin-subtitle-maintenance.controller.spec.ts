import { HttpStatus } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { AdminSubtitleMaintenanceController } from './admin-subtitle-maintenance.controller';

describe('AdminSubtitleMaintenanceController', () => {
  it('exposes an authenticated Administrator-only start and status contract', () => {
    const progress = { jobId: 'job-1', status: 'running' };
    const job = {
      getProgress: jest.fn().mockReturnValue(progress),
      start: jest.fn().mockReturnValue(progress),
    };
    const controller = new AdminSubtitleMaintenanceController(job as never);

    expect(controller.start()).toBe(progress);
    expect(controller.getStatus()).toBe(progress);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminSubtitleMaintenanceController),
    ).toEqual([JwtAuthGuard, AdminGuard]);
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminSubtitleMaintenanceController),
    ).toBe('admin/subtitles/pre-extraction');
    const startHandler = Object.getOwnPropertyDescriptor(
      AdminSubtitleMaintenanceController.prototype,
      'start',
    )?.value as unknown;
    if (typeof startHandler !== 'function') {
      throw new Error('Subtitle maintenance start handler is missing.');
    }
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, startHandler)).toBe(
      HttpStatus.ACCEPTED,
    );
  });
});
