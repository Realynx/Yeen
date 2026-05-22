import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MediaModule } from './media/media.module';
import { ProgressModule } from './progress/progress.module';
import { StreamModule } from './stream/stream.module';
import { SubtitleModule } from './subtitle/subtitle.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { TorrentModule } from './torrent/torrent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../web/dist'),
      exclude: ['/api{/*path}'],
    }),
    AuthModule,
    MediaModule,
    SystemSettingsModule,
    StreamModule,
    SubtitleModule,
    ProgressModule,
    TorrentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
