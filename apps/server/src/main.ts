import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

  const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

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

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
