import { Global, Module } from '@nestjs/common';
import {
  LOCAL_MEDIA_ITEM_INTAKE,
  LocalMediaItemIntakeFacade,
} from './application/services/local-media-item-intake.facade';
import { MediaModule } from './media.module';

@Global()
@Module({
  imports: [MediaModule],
  providers: [
    {
      provide: LOCAL_MEDIA_ITEM_INTAKE,
      useExisting: LocalMediaItemIntakeFacade,
    },
  ],
  exports: [LOCAL_MEDIA_ITEM_INTAKE],
})
export class LocalMediaIntegrationModule {}
