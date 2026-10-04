import { join } from 'node:path';
import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppService } from './domains/core/application/services/app.service';
import { AppController } from './domains/core/presentation/controllers/app.controller';
import { InstallAssetsController } from './domains/core/presentation/controllers/install-assets.controller';
import { AuthModule } from './domains/auth/auth.module';
import { InvitePageController } from './domains/core/presentation/controllers/invite-page.controller';
import { MediaModule } from './domains/media/media.module';
import { ProgressModule } from './domains/progress/progress.module';
import { StreamModule } from './domains/stream/stream.module';
import { BroadcastModule } from './domains/broadcast/broadcast.module';
import { SubtitleModule } from './domains/subtitle/subtitle.module';
import { SystemSettingsModule } from './domains/system-settings/system-settings.module';
import { DashboardModule } from './domains/dashboard/dashboard.module';
import { AddonsModule } from './domains/addons/addons.module';
import { LifecycleModule } from './domains/lifecycle/lifecycle.module';
import { OptionalIntegrationsModule } from './domains/core/optional-integrations.module';
import { LocalMediaIntegrationModule } from './domains/media/local-media-integration.module';
import { UpdatesModule } from './domains/updates/updates.module';
import { setWebStaticCacheHeaders } from './domains/core/infrastructure/http/web-static-cache-headers';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../web/dist'),
      exclude: ['/api{/*path}', '/invite{/*path}'],
      serveStaticOptions: {
        setHeaders: setWebStaticCacheHeaders,
      },
    }),
    AuthModule,
    MediaModule,
    DashboardModule,
    SystemSettingsModule,
    StreamModule,
    BroadcastModule,
    SubtitleModule,
    ProgressModule,
    OptionalIntegrationsModule,
    LocalMediaIntegrationModule,
    LifecycleModule,
    AddonsModule,
    UpdatesModule,
  ],
  controllers: [AppController, InvitePageController, InstallAssetsController],
  providers: [AppService],
})
export class AppModule {
  static register(addonModules: Type<unknown>[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: addonModules,
    };
  }
}
