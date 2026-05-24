import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MediaModule } from '../media/media.module';
import { ProgressModule } from '../progress/progress.module';
import { TorrentModule } from '../torrent/torrent.module';
import { AccountsStore } from './infrastructure/stores/accounts.store';
import { AuthController } from './presentation/controllers/auth.controller';
import { AuthService } from './application/services/auth.service';
import { AuthAdminAccountService } from './application/services/auth-admin-account.service';
import { InviteTokensStore } from './infrastructure/stores/invite-tokens.store';
import { JwtStrategy } from './infrastructure/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    ProgressModule,
    MediaModule,
    TorrentModule,
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
    AccountsStore,
    InviteTokensStore,
    JwtStrategy,
  ],
  exports: [AuthService, AccountsStore],
})
export class AuthModule {}
