import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../domain/entities/auth-user.entity';
import { AccountsStore } from './stores/accounts.store';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly accountsStore: AccountsStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-change-this',
    });
  }

  async validate(payload: unknown): Promise<AuthUser> {
    if (!isAuthUserPayload(payload)) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    const account = await this.accountsStore.findById(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return {
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
    };
  }
}

function isAuthUserPayload(payload: unknown): payload is AuthUser {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<Record<keyof AuthUser, unknown>>;
  if (
    typeof candidate.sub !== 'string' ||
    candidate.sub.trim().length === 0 ||
    typeof candidate.email !== 'string' ||
    candidate.email.trim().length === 0 ||
    typeof candidate.name !== 'string' ||
    candidate.name.trim().length === 0
  ) {
    return false;
  }

  return (
    candidate.role === 'admin' ||
    candidate.role === 'sailer' ||
    candidate.role === 'user'
  );
}
