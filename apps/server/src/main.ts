import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './domains/core/presentation/filters/http-exception.filter';

const INSECURE_JWT_SECRETS = new Set([
  'dev-change-this',
  'change-me',
  'changeme',
  'secret',
  'password',
]);

function validateProductionSecurity() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET?.trim() ?? '';
  if (
    jwtSecret.length < 32 ||
    INSECURE_JWT_SECRETS.has(jwtSecret.toLowerCase())
  ) {
    throw new Error(
      'Production requires JWT_SECRET to be set to a unique secret of at least 32 characters.',
    );
  }

  const corsOrigin = process.env.CORS_ORIGIN?.trim() ?? '';
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error(
      'Production requires CORS_ORIGIN to be set to explicit trusted origin(s).',
    );
  }
}

async function bootstrap() {
  validateProductionSecurity();

  const app = await NestFactory.create(AppModule);

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

  const localDevOriginPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

  function isOriginAllowed(origin: string): boolean {
    if (configuredOrigins.length === 0) {
      return true;
    }

    if (configuredOrigins.includes(origin)) {
      return true;
    }

    // Keep local development resilient when Vite switches between localhost and 127.0.0.1 ports.
    return localDevOriginPattern.test(origin);
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      // Return no CORS headers instead of throwing. This keeps same-origin
      // asset/module requests from failing hard when CORS_ORIGIN is strict.
      callback(null, false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'invite/:token', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
