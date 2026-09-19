import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SubtitleTracksService } from './subtitle-tracks.service';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';

const POSITIONED_ASS = `[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,{\\an7\\pos(200,140)}Warning sign`;

describe('SubtitleTracksService external ASS preparation', () => {
  let mediaFolder: string;
  let subtitleFolder: string;

  beforeEach(async () => {
    mediaFolder = await mkdtemp(join(tmpdir(), 'yeen-media-'));
    subtitleFolder = await mkdtemp(join(tmpdir(), 'yeen-subtitles-'));
  });

  it('offers uncommon FFmpeg text subtitle codecs for extraction', async () => {
    const commandService = {
      run: jest.fn().mockResolvedValue(
        JSON.stringify({
          streams: [
            {
              index: 4,
              codec_type: 'subtitle',
              codec_name: 'jacosub',
              tags: { language: 'en' },
            },
            {
              index: 5,
              codec_type: 'subtitle',
              codec_name: 'hdmv_pgs_subtitle',
              tags: { language: 'en' },
            },
          ],
        }),
      ),
    } as unknown as SubtitleCommandService;
    const storageService = {
      subtitleFolder: jest.fn().mockReturnValue(subtitleFolder),
      subtitleUrl: jest.fn(),
    } as unknown as SubtitleStorageService;
    const service = new SubtitleTracksService(commandService, storageService);

    const tracks = await service.probeEmbeddedTracks(
      'episode-1',
      join(mediaFolder, 'episode.mkv'),
      'ffprobe',
    );

    expect(
      tracks.find((track) => track.format === 'jacosub')?.extractable,
    ).toBe(true);
    expect(
      tracks.find((track) => track.format === 'hdmv_pgs_subtitle')?.extractable,
    ).toBe(false);
  });

  afterEach(async () => {
    await Promise.all([
      rm(mediaFolder, { recursive: true, force: true }),
      rm(subtitleFolder, { recursive: true, force: true }),
    ]);
  });

  it('prepares an external ASS track without flattening sign placement', async () => {
    const mediaPath = join(mediaFolder, 'episode.mkv');
    await writeFile(mediaPath, '', 'utf8');
    await writeFile(
      join(mediaFolder, 'episode.signs.ass'),
      POSITIONED_ASS,
      'utf8',
    );

    const runCommand = jest.fn();
    const commandService = {
      run: runCommand,
    } as unknown as SubtitleCommandService;
    const storageService = {
      ensureSubtitleFolder: jest.fn().mockResolvedValue(subtitleFolder),
      subtitleUrl: jest.fn(
        (_mediaId: string, fileName: string) => `/subtitles/${fileName}`,
      ),
    } as unknown as SubtitleStorageService;
    const service = new SubtitleTracksService(commandService, storageService);

    const tracks = await service.prepareExternalTracks(
      'episode-1',
      mediaPath,
      'ffmpeg',
    );
    const outputFileName = tracks[0]?.url?.split('/').at(-1) as string;
    const output = await readFile(join(subtitleFolder, outputFileName), 'utf8');

    expect(runCommand).not.toHaveBeenCalled();
    expect(tracks).toHaveLength(1);
    expect(output).toContain(
      '00:00:05.000 --> 00:00:07.000 line:12.963% position:10.417% align:start',
    );
  });
});
