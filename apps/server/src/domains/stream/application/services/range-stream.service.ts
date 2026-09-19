import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { lookup } from 'mime-types';

export interface ParsedByteRange {
  start: number;
  end: number;
}

export function parseSingleByteRange(
  header: string,
  fileSize: number,
): ParsedByteRange | null {
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    header.includes(',')
  ) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  if (!match[1]) return parseSuffixRange(match[2], fileSize);

  return parseExplicitRange(match[1], match[2], fileSize);
}

function parseSuffixRange(
  suffixText: string,
  fileSize: number,
): ParsedByteRange | null {
  const suffixLength = Number(suffixText);
  if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
  return {
    start: Math.max(0, fileSize - suffixLength),
    end: fileSize - 1,
  };
}

function parseExplicitRange(
  startText: string,
  endText: string,
  fileSize: number,
): ParsedByteRange | null {
  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

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
    response.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parsedRange = parseSingleByteRange(range, mediaStats.size);
      if (!parsedRange) {
        response
          .status(416)
          .setHeader('Content-Range', `bytes */${mediaStats.size}`);
        response.end();
        return;
      }

      const { start, end } = parsedRange;

      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${start}-${end}/${mediaStats.size}`,
      );
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
