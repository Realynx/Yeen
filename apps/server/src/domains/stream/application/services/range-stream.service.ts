import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { lookup } from 'mime-types';

@Injectable()
export class RangeStreamService {
  async streamFile(
    filePath: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const mediaStats = await stat(filePath);
    const contentType = lookup(filePath) || 'application/octet-stream';
    const range = request.headers.range;

    if (range) {
      const [startRaw, endRaw] = range.replace('bytes=', '').split('-');
      const start = Number(startRaw);
      const end = endRaw ? Number(endRaw) : mediaStats.size - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= mediaStats.size ||
        start > end
      ) {
        response
          .status(416)
          .setHeader('Content-Range', `bytes */${mediaStats.size}`);
        response.end();
        return;
      }

      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${start}-${end}/${mediaStats.size}`,
      );
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Length', end - start + 1);
      response.setHeader('Content-Type', contentType.toString());

      createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.status(200);
    response.setHeader('Content-Length', mediaStats.size);
    response.setHeader('Content-Type', contentType.toString());
    createReadStream(filePath).pipe(response);
  }
}
