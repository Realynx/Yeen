import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccountsStore } from './accounts.store';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteTokensStore } from './invite-tokens.store';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
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
  providers: [AuthService, AccountsStore, InviteTokensStore, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
