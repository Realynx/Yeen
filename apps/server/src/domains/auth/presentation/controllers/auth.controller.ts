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
import { AuthPasswordResetService } from '../../application/services/auth-password-reset.service';
import { AuthService } from '../../application/services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ChangePasswordDto } from '../../application/dto/change-password.dto';
import { ClaimTvPairingCodeDto } from '../../application/dto/claim-tv-pairing-code.dto';
import { CreateAdminAccountDto } from '../../application/dto/create-admin-account.dto';
import { LoginDto } from '../../application/dto/login.dto';
import { PollTvPairingDto } from '../../application/dto/poll-tv-pairing.dto';
import { RequestTvPairingDto } from '../../application/dto/request-tv-pairing.dto';
import { ResetAccountPasswordDto } from '../../application/dto/reset-account-password.dto';
import { RegisterDto } from '../../application/dto/register.dto';
import { UpdateAdminAccountProfileDto } from '../../application/dto/update-admin-account-profile.dto';
import { UpdateAccountInvitesDto } from '../../application/dto/update-account-invites.dto';
import { UpdateAccountMaxBitrateDto } from '../../application/dto/update-account-max-bitrate.dto';
import { UpdateAccountRoleDto } from '../../application/dto/update-account-role.dto';
import { UpdateProfileDto } from '../../application/dto/update-profile.dto';
import type { AuthUser } from '../../domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authPasswordResetService: AuthPasswordResetService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('password-reset/request')
  requestPasswordReset() {
    return this.authPasswordResetService.requestPasswordReset();
  }

  @Post('password-reset/confirm')
  confirmPasswordReset() {
    return this.authPasswordResetService.confirmPasswordReset();
  }

  @Post('tv/pairings')
  requestTvPairing(@Body() dto: RequestTvPairingDto) {
    return this.authService.requestTvPairing(dto);
  }

  @Post('tv/pairings/:pairingId/status')
  pollTvPairingStatus(
    @Param('pairingId') pairingId: string,
    @Body() dto: PollTvPairingDto,
  ) {
    return this.authService.pollTvPairingStatus(pairingId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tv/pairings/claim')
  claimTvPairingCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClaimTvPairingCodeDto,
  ) {
    return this.authService.claimTvPairingCode(user, dto);
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
  @Get('admin/accounts/activity')
  listAccountActivityForAdmin() {
    return this.authService.listAccountsActivityForAdmin();
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
  @Patch('admin/accounts/:accountId/profile')
  setAccountProfile(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAdminAccountProfileDto,
  ) {
    return this.authService.setAccountProfile(accountId, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/accounts/:accountId/password/reset')
  resetAccountPassword(
    @Param('accountId') accountId: string,
    @Body() dto: ResetAccountPasswordDto,
  ) {
    return this.authService.resetAccountPassword(accountId, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/accounts/:accountId/role')
  setAccountRole(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountRoleDto,
  ) {
    return this.authService.setAccountRole(accountId, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/accounts/:accountId/max-bitrate')
  setAccountMaxBitrate(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAccountMaxBitrateDto,
  ) {
    return this.authService.setAccountMaxBitrate(accountId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refreshSession(@CurrentUser() user: AuthUser) {
    return this.authService.refreshSession(user);
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
