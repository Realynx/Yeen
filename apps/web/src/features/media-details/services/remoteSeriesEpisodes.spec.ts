import { describe, expect, it } from 'vitest';
import type {
  MediaItem,
  RemoteSeriesEpisode,
  RemoteSeriesEpisodeCatalogResult,
} from '../../shared/services/types';
import {
  buildRemoteEpisodeMediaItem,
  remoteSeriesDetailsPath,
  resolveRemoteActiveSeason,
  selectedSeasonForMedia,
} from './remoteSeriesEpisodes';

const series = {
  id: 'remote_tmdb_show_1399',
  title: 'Game of Thrones',
  type: 'show',
  remoteSource: 'tmdb',
  remoteSourceId: '1399',
  isRemote: true,
  dedupeKey: 'remote:tmdb:show:1399',
  relativePath: 'Remote catalog result (TMDB)',
} as MediaItem;

const catalog = {
  status: 'ready',
  source: 'tmdb',
  sourceLabel: 'TMDB',
  providerId: '1399',
  totalEpisodeCount: 1,
  seasons: [],
  updatedAt: '2026-08-26T12:00:00.000Z',
} satisfies RemoteSeriesEpisodeCatalogResult;

const episode: RemoteSeriesEpisode = {
  seasonNumber: 2,
  episodeNumber: 3,
  title: 'What Is Dead May Never Die',
  synopsis: 'Tyrion plots three alliances.',
  airedAt: '2012-04-15',
};

describe('remote series episode details', () => {
  it('builds a stable deep link for an exact remote episode', () => {
    expect(remoteSeriesDetailsPath('tmdb', '1399', 2, 3)).toBe(
      '/details/remote_tmdb_show_1399?season=2&episode=3',
    );
  });

  it('gives add-ons a MediaItem-shaped exact episode context', () => {
    expect(buildRemoteEpisodeMediaItem(series, catalog, episode)).toMatchObject({
      id: 'remote_tmdb_show_1399',
      title: 'Game of Thrones',
      type: 'show',
      isRemote: true,
      remoteSource: 'tmdb',
      remoteSourceId: '1399',
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: 'What Is Dead May Never Die',
      description: 'Tyrion plots three alliances.',
      remoteEpisodeContext: {
        source: 'tmdb',
        providerId: '1399',
        seriesId: 'remote_tmdb_show_1399',
        seriesTitle: 'Game of Thrones',
        seasonNumber: 2,
        episodeNumber: 3,
        episodeTitle: 'What Is Dead May Never Die',
      },
    });
  });

  it('lets a deep-linked season override an earlier in-page selection', () => {
    expect(resolveRemoteActiveSeason(2, 4)).toBe(2);
  });

  it('does not carry a selected season to a different series', () => {
    expect(
      selectedSeasonForMedia(
        { mediaId: 'remote_tmdb_show_1399', seasonNumber: 4 },
        'remote_tmdb_show_94605',
      ),
    ).toBeNull();
  });
});
