import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppService } from './domains/core/application/services/app.service';
import { AppController } from './domains/core/presentation/controllers/app.controller';
import { AuthModule } from './domains/auth/auth.module';
import { InvitePageController } from './domains/core/presentation/controllers/invite-page.controller';
import { MediaModule } from './domains/media/media.module';
import { ProgressModule } from './domains/progress/progress.module';
import { StreamModule } from './domains/stream/stream.module';
import { BroadcastModule } from './domains/broadcast/broadcast.module';
import { SubtitleModule } from './domains/subtitle/subtitle.module';
import { SystemSettingsModule } from './domains/system-settings/system-settings.module';
import { TorrentModule } from './domains/torrent/torrent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../web/dist'),
      exclude: ['/api{/*path}', '/invite{/*path}'],
    }),
    AuthModule,
    MediaModule,
    SystemSettingsModule,
    StreamModule,
    BroadcastModule,
    SubtitleModule,
    ProgressModule,
    TorrentModule,
  ],
  controllers: [AppController, InvitePageController],
  providers: [AppService],
})
export class AppModule {}
