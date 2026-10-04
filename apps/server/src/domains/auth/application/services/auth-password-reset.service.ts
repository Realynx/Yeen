import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AuthPasswordResetService {
  requestPasswordReset() {
    return {
      message: 'Contact your Yeen administrator to reset your password.',
      resetPath: null,
      expiresAt: null,
    };
  }

  confirmPasswordReset(): never {
    throw new BadRequestException(
      'Self-service password recovery is unavailable. Contact your Yeen administrator.',
    );
  }
}
