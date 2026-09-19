import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MediaModule } from '../media/media.module';
import { ProgressModule } from '../progress/progress.module';
import { AccountsStore } from './infrastructure/stores/accounts.store';
import { AuthController } from './presentation/controllers/auth.controller';
import { AuthAvatarService } from './application/services/auth-avatar.service';
import { AuthService } from './application/services/auth.service';
import { AuthAdminAccountService } from './application/services/auth-admin-account.service';
import { AuthPasswordResetService } from './application/services/auth-password-reset.service';
import { AuthTvPairingService } from './application/services/auth-tv-pairing.service';
import { InviteTokensStore } from './infrastructure/stores/invite-tokens.store';
import { TvPairingsStore } from './infrastructure/stores/tv-pairings.store';
import { JwtStrategy } from './infrastructure/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    ProgressModule,
    MediaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'dev-change-this',
        signOptions: {
          expiresIn: '12h',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAdminAccountService,
    AuthPasswordResetService,
    AuthTvPairingService,
    AuthAvatarService,
    AccountsStore,
    InviteTokensStore,
    TvPairingsStore,
    JwtStrategy,
  ],
  exports: [AuthService, AccountsStore],
})
export class AuthModule {}
