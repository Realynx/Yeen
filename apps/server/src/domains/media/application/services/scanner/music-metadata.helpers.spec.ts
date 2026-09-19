import { MediaProbeAdapter } from '../../../infrastructure/media-probe.adapter';
import {
  extractMusicMetadata,
  findEmbeddedArtworkStream,
  isMusicExtension,
} from './music-metadata.helpers';

describe('music metadata helpers', () => {
  it('recognizes common music containers without treating video as music', () => {
    expect(isMusicExtension('.MP3')).toBe(true);
    expect(isMusicExtension('.flac')).toBe(true);
    expect(isMusicExtension('.mkv')).toBe(false);
  });

  it('normalizes ffprobe tags and numbered track/disc values', () => {
    const result = extractMusicMetadata(
      {
        format: {
          tags: {
            TITLE: 'Midnight City',
            ARTIST: 'M83',
            ALBUM: 'Hurry Up, We’re Dreaming',
            album_artist: 'M83',
            TRACK: '3/22',
            DISCNUMBER: '1/2',
            GENRE: 'Electronic',
            DATE: '2011-10-18',
          },
        },
      },
      'M83/Hurry Up, We’re Dreaming/03 Midnight City.flac',
      true,
      false,
    );

    expect(result).toEqual({
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, We’re Dreaming',
      albumArtist: 'M83',
      trackNumber: 3,
      discNumber: 1,
      genre: 'Electronic',
      releaseYear: 2011,
      artworkKind: 'embedded',
    });
  });

  it('falls back to artist and album folders when tags are absent', () => {
    const result = extractMusicMetadata(
      {},
      'Nujabes/Modal Soul/Feather.mp3',
      false,
      true,
    );

    expect(result.artist).toBe('Nujabes');
    expect(result.album).toBe('Modal Soul');
    expect(result.artworkKind).toBe('sidecar');
  });

  it('separates attached cover art from the playable video stream', () => {
    const streams = [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'mjpeg',
        disposition: { attached_pic: 1 },
      },
      { index: 1, codec_type: 'audio', codec_name: 'mp3' },
      { index: 2, codec_type: 'video', codec_name: 'h264' },
    ];

    expect(findEmbeddedArtworkStream(streams)?.index).toBe(0);
    expect(new MediaProbeAdapter().selectStreams(streams).video?.index).toBe(2);
  });
});
