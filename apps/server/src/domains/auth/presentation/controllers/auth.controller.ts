import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../guards/admin.guard';
import { AuthService } from '../../application/services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ChangePasswordDto } from '../../application/dto/change-password.dto';
import { CreateAdminAccountDto } from '../../application/dto/create-admin-account.dto';
import { LoginDto } from '../../application/dto/login.dto';
import { RegisterDto } from '../../application/dto/register.dto';
import { UpdateAccountInvitesDto } from '../../application/dto/update-account-invites.dto';
import { UpdateAccountRoleDto } from '../../application/dto/update-account-role.dto';
import { UpdateProfileDto } from '../../application/dto/update-profile.dto';
import type { AuthUser } from '../../domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('invites/:token')
  getInviteStatus(@Param('token') token: string) {
    return this.authService.getInviteStatus(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites')
  createInvite(@CurrentUser() user: AuthUser) {
    return this.authService.createInvite(user);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/accounts')
  listAccountsForAdmin() {
    return this.authService.listAccountsForAdmin();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/accounts')
  createAccountAsAdmin(@Body() dto: CreateAdminAccountDto) {
    return this.authService.createAccountAsAdmin(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/accounts/:accountId/invites')
  setAccountInvites(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountInvitesDto,
  ) {
    return this.authService.setAccountInvites(accountId, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/accounts/:accountId/role')
  setAccountRole(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountRoleDto,
  ) {
    return this.authService.setAccountRole(accountId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() imageFile?: unknown,
  ) {
    const normalizedFile = this.normalizeUploadedImage(imageFile);
    return this.authService.uploadAvatar(user, normalizedFile);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.authService.removeAvatar(user);
  }

  private normalizeUploadedImage(
    value: unknown,
  ): { buffer: Buffer; mimetype: string } | undefined {
    if (!this.isObject(value)) {
      return undefined;
    }

    const candidateBuffer = value['buffer'];
    if (!Buffer.isBuffer(candidateBuffer)) {
      return undefined;
    }

    const candidateType =
      typeof value['mimetype'] === 'string' ? value['mimetype'].trim() : '';

    return {
      buffer: candidateBuffer,
      mimetype: candidateType,
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
