import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaService } from '../../../media/application/services/media.service';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { SubtitleExtractionService } from './subtitle-extraction.service';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { SubtitleTracksService } from './subtitle-tracks.service';

const POSITIONED_ASS = `[Script Info]
PlayResX: 1280
PlayResY: 720

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,{\\an9\\pos(1100,80)}Store sign`;

describe('SubtitleExtractionService', () => {
  let subtitleFolder: string;

  beforeEach(async () => {
    subtitleFolder = await mkdtemp(join(tmpdir(), 'yeen-subtitle-extraction-'));
  });

  afterEach(async () => {
    await rm(subtitleFolder, { recursive: true, force: true });
  });

  it('extracts through ASS so embedded positioning survives in the playable VTT', async () => {
    const mediaService = {
      getById: jest.fn().mockResolvedValue({
        filePath: 'episode.mkv',
        relativePath: null,
      }),
      resolveMediaFilePath: jest
        .fn()
        .mockResolvedValue('C:\\media\\episode.mkv'),
    } as unknown as MediaService;
    const systemSettingsService = {
      getSettings: jest.fn().mockResolvedValue({ ffmpegPath: 'ffmpeg' }),
    } as unknown as SystemSettingsService;
    const runCommand = jest.fn(async (_command: string, args: string[]) => {
      await writeFile(args.at(-1) as string, POSITIONED_ASS, 'utf8');
      return '';
    });
    const commandService = {
      run: runCommand,
    } as unknown as SubtitleCommandService;
    const storageService = {
      ensureSubtitleFolder: jest.fn().mockResolvedValue(subtitleFolder),
      subtitleUrl: jest.fn(
        (_mediaId: string, fileName: string) => `/subtitles/${fileName}`,
      ),
    } as unknown as SubtitleStorageService;
    const service = new SubtitleExtractionService(
      mediaService,
      systemSettingsService,
      commandService,
      storageService,
      { probeEmbeddedTracks: jest.fn() } as unknown as SubtitleTracksService,
    );

    const result = await service.extractEmbedded('episode-1', 4);
    const outputFileName = result.url.split('/').at(-1) as string;
    const output = await readFile(join(subtitleFolder, outputFileName), 'utf8');
    const generatedFiles = await readdir(subtitleFolder);

    expect(runCommand).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-map', '0:4', '-c:s', 'ass']),
    );
    expect(output).toContain('WEBVTT');
    expect(output).toContain(
      '00:00:02.000 --> 00:00:04.000 line:11.111% position:85.938% align:end',
    );
    expect(generatedFiles).toEqual([outputFileName]);
  });

  it('deduplicates concurrent extraction requests for the same embedded track', async () => {
    let releaseCommand: (() => void) | null = null;
    const commandGate = new Promise<void>((resolve) => {
      releaseCommand = resolve;
    });
    const mediaService = {
      getById: jest
        .fn()
        .mockResolvedValue({ filePath: 'episode.mkv', relativePath: null }),
      resolveMediaFilePath: jest
        .fn()
        .mockResolvedValue('C:\\media\\episode.mkv'),
    } as unknown as MediaService;
    const systemSettingsService = {
      getSettings: jest.fn().mockResolvedValue({ ffmpegPath: 'ffmpeg' }),
    } as unknown as SystemSettingsService;
    const runCommand = jest.fn(async (_command: string, args: string[]) => {
      await commandGate;
      await writeFile(args.at(-1) as string, POSITIONED_ASS, 'utf8');
      return '';
    });
    const storageService = {
      ensureSubtitleFolder: jest.fn().mockResolvedValue(subtitleFolder),
      subtitleUrl: jest.fn(
        (_mediaId: string, name: string) => `/subtitles/${name}`,
      ),
    } as unknown as SubtitleStorageService;
    const service = new SubtitleExtractionService(
      mediaService,
      systemSettingsService,
      { run: runCommand } as unknown as SubtitleCommandService,
      storageService,
      { probeEmbeddedTracks: jest.fn() } as unknown as SubtitleTracksService,
    );

    const first = service.extractEmbedded('episode-1', 4);
    const second = service.extractEmbedded('episode-1', 4);
    for (
      let attempt = 0;
      attempt < 10 && runCommand.mock.calls.length < 2;
      attempt += 1
    ) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    releaseCommand?.();
    await Promise.all([first, second]);

    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('rebuilds an invalid cached subtitle in the same request', async () => {
    await writeFile(
      join(subtitleFolder, 'embedded_4_v3.vtt'),
      'partial subtitle payload',
      'utf8',
    );
    const mediaService = {
      getById: jest
        .fn()
        .mockResolvedValue({ filePath: 'episode.mkv', relativePath: null }),
      resolveMediaFilePath: jest
        .fn()
        .mockResolvedValue('C:\\media\\episode.mkv'),
    } as unknown as MediaService;
    const systemSettingsService = {
      getSettings: jest.fn().mockResolvedValue({ ffmpegPath: 'ffmpeg' }),
    } as unknown as SystemSettingsService;
    const runCommand = jest.fn(async (_command: string, args: string[]) => {
      await writeFile(args.at(-1) as string, POSITIONED_ASS, 'utf8');
      return '';
    });
    const storageService = {
      ensureSubtitleFolder: jest.fn().mockResolvedValue(subtitleFolder),
      subtitleUrl: jest.fn(
        (_mediaId: string, name: string) => `/subtitles/${name}`,
      ),
    } as unknown as SubtitleStorageService;
    const service = new SubtitleExtractionService(
      mediaService,
      systemSettingsService,
      { run: runCommand } as unknown as SubtitleCommandService,
      storageService,
      { probeEmbeddedTracks: jest.fn() } as unknown as SubtitleTracksService,
    );

    const result = await service.extractEmbedded('episode-1', 4);

    expect(result.url).toContain('embedded_4_v3.vtt');
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('summarizes extracted, cached, unsupported, and failed embedded tracks', async () => {
    const mediaService = {
      getById: jest
        .fn()
        .mockResolvedValue({ filePath: 'episode.mkv', relativePath: null }),
      resolveMediaFilePath: jest
        .fn()
        .mockResolvedValue('C:\\media\\episode.mkv'),
    } as unknown as MediaService;
    const systemSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        ffmpegPath: 'ffmpeg',
        ffprobePath: 'ffprobe',
      }),
    } as unknown as SystemSettingsService;
    const runCommand = jest.fn(async (_command: string, args: string[]) => {
      if (args.includes('0:6')) {
        throw new Error('decoder failed');
      }
      await writeFile(args.at(-1) as string, POSITIONED_ASS, 'utf8');
      return '';
    });
    const storageService = {
      ensureSubtitleFolder: jest.fn().mockResolvedValue(subtitleFolder),
      subtitleUrl: jest.fn(
        (_mediaId: string, name: string) => `/subtitles/${name}`,
      ),
    } as unknown as SubtitleStorageService;
    const tracksService = {
      probeEmbeddedTracks: jest.fn().mockResolvedValue([
        {
          streamIndex: 2,
          format: 'ass',
          extractable: true,
          url: '/cached.vtt',
        },
        { streamIndex: 4, format: 'jacosub', extractable: true, url: null },
        {
          streamIndex: 5,
          format: 'hdmv_pgs_subtitle',
          extractable: false,
          url: null,
        },
        { streamIndex: 6, format: 'subrip', extractable: true, url: null },
      ]),
    } as unknown as SubtitleTracksService;
    const service = new SubtitleExtractionService(
      mediaService,
      systemSettingsService,
      { run: runCommand } as unknown as SubtitleCommandService,
      storageService,
      tracksService,
    );

    const summary = await service.extractAllEmbedded('episode-1');

    expect(summary).toMatchObject({
      mediaId: 'episode-1',
      totalTracks: 4,
      extracted: 1,
      alreadyReady: 1,
      unsupported: 1,
      failed: 1,
    });
    expect(summary.tracks.map((track) => track.status)).toEqual([
      'already-ready',
      'extracted',
      'unsupported',
      'failed',
    ]);
  });
});
