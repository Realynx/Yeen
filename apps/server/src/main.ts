import type { RequestListener } from 'node:http';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './domains/core/presentation/filters/http-exception.filter';
import {
  bootstrapAddonHost,
  quarantineAddonHostModules,
} from './domains/addons/infrastructure/addon-host.bootstrap';
import { playbackReceiverCorsMiddleware } from './domains/stream/presentation/middleware/playback-receiver-cors.middleware';
import {
  createDualProtocolServer,
  loadDualProtocolTlsOptions,
} from './transport/dual-protocol-server';

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

  const addonHost = await bootstrapAddonHost();
  const app = await createApplicationWithAddonFallback(addonHost);
  app.enableShutdownHooks();
  app.use('/api/stream', playbackReceiverCorsMiddleware);

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

  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const tlsOptions = await loadDualProtocolTlsOptions({
    certificatePath: process.env.YEEN_TLS_CERT_PATH,
    keyPath: process.env.YEEN_TLS_KEY_PATH,
  });
  if (!tlsOptions) {
    await app.listen(port);
    return;
  }

  await app.init();
  const dualProtocolServer = createDualProtocolServer(
    app.getHttpAdapter().getInstance() as RequestListener,
    tlsOptions,
  );
  await new Promise<void>((resolve, reject) => {
    dualProtocolServer.once('error', reject);
    dualProtocolServer.listen(port, () => {
      dualProtocolServer.removeListener('error', reject);
      resolve();
    });
  });
}

async function createApplicationWithAddonFallback(addonHost: {
  nestModules: import('@nestjs/common').Type<unknown>[];
  moduleAddonIds: string[];
}) {
  try {
    return await NestFactory.create(AppModule.register(addonHost.nestModules), {
      abortOnError: false,
    });
  } catch (error) {
    if (addonHost.nestModules.length === 0) throw error;
    console.error(
      'An add-on Nest module failed during application initialization. Quarantining module-contributing add-ons and trying their previous packages.',
      error,
    );
    const fallbackHost = await quarantineAddonHostModules(
      addonHost.moduleAddonIds,
    );
    try {
      return await NestFactory.create(
        AppModule.register(fallbackHost.nestModules),
        { abortOnError: false },
      );
    } catch (fallbackError) {
      if (fallbackHost.nestModules.length === 0) throw fallbackError;
      console.error(
        'A fallback add-on Nest module also failed during application initialization. Quarantining it and starting Core Yeen only.',
        fallbackError,
      );
      await quarantineAddonHostModules(fallbackHost.moduleAddonIds);
      return NestFactory.create(AppModule.register(), { abortOnError: false });
    }
  }
}

void bootstrap();
