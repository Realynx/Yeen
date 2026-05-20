import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountsStore } from './accounts.store';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccountRecord } from './entities/account-record.entity';
import { AuthUser } from './entities/auth-user.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  async register(dto: RegisterDto) {
    const existing = await this.accountsStore.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const account = await this.accountsStore.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    return this.buildAuthResponse(account);
  }

  async login(dto: LoginDto) {
    const account = await this.accountsStore.findByEmail(dto.email);
    if (!account) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const matches = await bcrypt.compare(dto.password, account.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(account);
  }

  async me(user: AuthUser) {
    const account = await this.accountsStore.findById(user.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return this.toSafeAccount(account);
  }

  private async buildAuthResponse(account: AccountRecord) {
    const payload: AuthUser = {
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: this.toSafeAccount(account),
    };
  }

  private toSafeAccount(account: AccountRecord) {
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      createdAt: account.createdAt,
    };
  }

  private async ensureDefaultAdmin() {
    const email = this.configService.get<string>('DEFAULT_ADMIN_EMAIL')?.trim();
    const password = this.configService
      .get<string>('DEFAULT_ADMIN_PASSWORD')
      ?.trim();
    const name =
      this.configService.get<string>('DEFAULT_ADMIN_NAME')?.trim() ||
      'Yeen Admin';

    if (!email || !password) {
      return;
    }

    const existing = await this.accountsStore.findByEmail(email);
    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.accountsStore.create({
      email,
      name,
      passwordHash,
      role: 'admin',
    });

    this.logger.log(`Seeded default admin account for ${email}.`);
  }
}
