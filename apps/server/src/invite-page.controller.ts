import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth/auth.service';
import { AppService } from './app.service';

@Controller('invite')
export class InvitePageController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
  ) {}

  @Get(':token')
  async getInviteSharePage(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
    @Headers('x-forwarded-proto') forwardedProto?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
  ): Promise<void> {
    const inviteToken = token.trim();

    if (!inviteToken) {
      throw new BadRequestException('Invite token is required.');
    }

    let inviterName: string | null = null;
    let inviteIsValid = false;

    try {
      const invite = await this.authService.getInviteStatus(inviteToken);
      inviterName = invite.inviterName;
      inviteIsValid = true;
    } catch {
      inviterName = null;
      inviteIsValid = false;
    }

    const origin = this.resolveRequestOrigin(request, {
      forwardedProto,
      forwardedHost,
    });

    const html = await this.appService.renderInviteSharePage({
      inviteToken,
      inviterName,
      inviteIsValid,
      origin,
    });

    response
      .status(inviteIsValid ? 200 : 404)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Cache-Control', 'no-store, max-age=0')
      .send(html);
  }

  private resolveRequestOrigin(
    request: Request,
    input: { forwardedProto?: string; forwardedHost?: string },
  ): string {
    const host =
      input.forwardedHost?.split(',')[0]?.trim() || request.get('host') || 'localhost';

    const proto =
      input.forwardedProto?.split(',')[0]?.trim() ||
      request.protocol ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1')
        ? 'http'
        : 'https');

    return `${proto}://${host}`;
  }
}
