import { Global, Module } from '@nestjs/common';
import {
  ADMIN_ACTIVITY_SOURCES,
  AdminActivitySourceRegistry,
} from './application/extensions/admin-activity-source';
import {
  PROGRESSIVE_PLAYBACK_SOURCES,
  ProgressivePlaybackSourceRegistry,
} from './application/extensions/progressive-playback-source';
import {
  ADDON_SETTINGS,
  AddonSettingsStore,
} from './application/extensions/addon-settings';
import {
  METADATA_COMMIT_PARTICIPANTS,
  MetadataCommitParticipantRegistry,
} from './application/extensions/metadata-commit-participant';
import {
  REMOTE_MUSIC_SOURCES,
  RemoteMusicSourceRegistry,
} from './application/extensions/remote-music-source';

@Global()
@Module({
  providers: [
    AdminActivitySourceRegistry,
    ProgressivePlaybackSourceRegistry,
    MetadataCommitParticipantRegistry,
    AddonSettingsStore,
    RemoteMusicSourceRegistry,
    {
      provide: ADMIN_ACTIVITY_SOURCES,
      useExisting: AdminActivitySourceRegistry,
    },
    {
      provide: REMOTE_MUSIC_SOURCES,
      useExisting: RemoteMusicSourceRegistry,
    },
    {
      provide: PROGRESSIVE_PLAYBACK_SOURCES,
      useExisting: ProgressivePlaybackSourceRegistry,
    },
    { provide: ADDON_SETTINGS, useExisting: AddonSettingsStore },
    {
      provide: METADATA_COMMIT_PARTICIPANTS,
      useExisting: MetadataCommitParticipantRegistry,
    },
  ],
  exports: [
    AdminActivitySourceRegistry,
    ProgressivePlaybackSourceRegistry,
    ADMIN_ACTIVITY_SOURCES,
    PROGRESSIVE_PLAYBACK_SOURCES,
    METADATA_COMMIT_PARTICIPANTS,
    ADDON_SETTINGS,
    REMOTE_MUSIC_SOURCES,
    RemoteMusicSourceRegistry,
  ],
})
export class OptionalIntegrationsModule {}
