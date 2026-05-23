import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

interface InviteSharePageInput {
  inviteToken: string;
  inviterName: string | null;
  inviteIsValid: boolean;
  origin: string;
}

interface InviteMetaTagInput {
  title: string;
  description: string;
  inviteUrl: string;
  openGraphImageUrl: string;
  twitterImageUrl: string;
}

@Injectable()
export class AppService {
  private readonly webDistIndexPath = join(__dirname, '../../web/dist/index.html');
  private readonly webSourceIndexPath = join(__dirname, '../../web/index.html');

  getHealth() {
    return {
      status: 'ok',
      service: 'yeen-api',
      timestamp: new Date().toISOString(),
    };
  }

  async renderInviteSharePage(input: InviteSharePageInput): Promise<string> {
    const template = await this.loadWebIndexTemplate();
    const normalizedToken = input.inviteToken.trim();
    const invitePath = `/invite/${encodeURIComponent(normalizedToken)}`;
    const inviteUrl = `${input.origin}${invitePath}`;
    const openGraphImageUrl = `${input.origin}/pwa-512x512.png`;
    const twitterImageUrl = `${input.origin}/pwa-192x192.png`;
    const title = this.buildInviteTitle(input.inviterName, input.inviteIsValid);
    const description = this.buildInviteDescription(
      input.inviterName,
      input.inviteIsValid,
    );
    const socialMetaTags = this.buildInviteMetaTags({
      title,
      description,
      inviteUrl,
      openGraphImageUrl,
      twitterImageUrl,
    });
    const templateWithoutTitle = template.replace(/<title>[\s\S]*?<\/title>/i, '');

    if (!templateWithoutTitle.includes('</head>')) {
      return `${templateWithoutTitle}\n<head>\n    ${socialMetaTags}\n  </head>`;
    }

    return templateWithoutTitle.replace(
      '</head>',
      `    ${socialMetaTags}\n  </head>`,
    );
  }

  private async loadWebIndexTemplate(): Promise<string> {
    try {
      return await readFile(this.webDistIndexPath, 'utf8');
    } catch {
      try {
        return await readFile(this.webSourceIndexPath, 'utf8');
      } catch {
        return [
          '<!doctype html>',
          '<html lang="en">',
          '  <head>',
          '    <meta charset="UTF-8" />',
          '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
          '  </head>',
          '  <body>',
          '    <div id="root"></div>',
          '  </body>',
          '</html>',
        ].join('\n');
      }
    }
  }

  private buildInviteTitle(
    inviterName: string | null,
    inviteIsValid: boolean,
  ): string {
    if (!inviteIsValid) {
      return 'Yeen Invite Link';
    }

    const trimmedInviter = inviterName?.trim();
    if (trimmedInviter) {
      return `${trimmedInviter} invited you to Yeen`;
    }

    return 'You are invited to join Yeen';
  }

  private buildInviteDescription(
    inviterName: string | null,
    inviteIsValid: boolean,
  ): string {
    if (!inviteIsValid) {
      return 'Open this link to check the invite and create your Yeen account.';
    }

    const trimmedInviter = inviterName?.trim();
    if (trimmedInviter) {
      return `${trimmedInviter} shared a Yeen invite with you. Create your account to join their server.`;
    }

    return 'Create your Yeen account with this invite link and start watching together.';
  }

  private buildInviteMetaTags(input: InviteMetaTagInput): string {
    const escapedTitle = this.escapeHtml(input.title);
    const escapedDescription = this.escapeHtml(input.description);
    const escapedInviteUrl = this.escapeHtml(input.inviteUrl);
    const escapedOpenGraphImageUrl = this.escapeHtml(input.openGraphImageUrl);
    const escapedTwitterImageUrl = this.escapeHtml(input.twitterImageUrl);

    return [
      `<title>${escapedTitle}</title>`,
      `<meta name="description" content="${escapedDescription}" />`,
      '<meta name="robots" content="noindex, nofollow, noarchive" />',
      `<link rel="canonical" href="${escapedInviteUrl}" />`,
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="Yeen" />',
      `<meta property="og:title" content="${escapedTitle}" />`,
      `<meta property="og:description" content="${escapedDescription}" />`,
      `<meta property="og:url" content="${escapedInviteUrl}" />`,
      `<meta property="og:image" content="${escapedOpenGraphImageUrl}" />`,
      `<meta property="og:image:alt" content="${escapedTitle}" />`,
      '<meta name="twitter:card" content="summary" />',
      `<meta name="twitter:title" content="${escapedTitle}" />`,
      `<meta name="twitter:description" content="${escapedDescription}" />`,
      `<meta name="twitter:image" content="${escapedTwitterImageUrl}" />`,
      `<meta name="twitter:image:alt" content="${escapedTitle}" />`,
    ].join('\n    ');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
