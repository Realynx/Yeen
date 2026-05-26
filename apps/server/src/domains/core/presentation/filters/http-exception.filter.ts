import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface StructuredApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.toStructuredPayload(exception, statusCode, request);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json(payload);
  }

  private toStructuredPayload(
    exception: unknown,
    statusCode: number,
    request: Request,
  ): StructuredApiError {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const baseError = HttpStatus[statusCode] ?? 'Error';

      if (typeof response === 'string') {
        return {
          statusCode,
          message: response,
          error: baseError,
          path: request.originalUrl || request.url,
          timestamp: new Date().toISOString(),
        };
      }

      if (this.isObject(response)) {
        const message = response['message'];
        const error = response['error'];

        return {
          statusCode:
            typeof response['statusCode'] === 'number'
              ? response['statusCode']
              : statusCode,
          message:
            typeof message === 'string' || Array.isArray(message)
              ? message
              : exception.message || baseError,
          error: typeof error === 'string' ? error : baseError,
          path: request.originalUrl || request.url,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      statusCode,
      message:
        statusCode === 500 ? 'Internal server error.' : 'Request failed.',
      error: HttpStatus[statusCode] ?? 'Error',
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
