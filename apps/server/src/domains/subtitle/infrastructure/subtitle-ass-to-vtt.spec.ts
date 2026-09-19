import { convertAssToVtt } from './subtitle-ass-to-vtt';

const HEADER = `[Script Info]
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,2,30,30,35,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

describe('convertAssToVtt', () => {
  it('preserves explicit sign coordinates and alignment as WebVTT cue settings', () => {
    const source = `${HEADER}\nDialogue: 2,0:00:01.20,0:00:04.50,Default,,0,0,0,,{\\an7\\pos(1540,180)}East High School`;

    expect(convertAssToVtt(source)).toContain(
      '00:00:01.200 --> 00:00:04.500 line:16.667% position:80.208% align:start',
    );
    expect(convertAssToVtt(source)).toContain('East High School');
  });

  it('keeps simultaneous dialogue and sign cues separate and retains line breaks', () => {
    const source = `${HEADER}
Dialogue: 0,0:00:10.00,0:00:13.00,Default,,0,0,35,,First line\\NSecond line
Dialogue: 1,0:00:10.00,0:00:13.00,Default,,0,0,0,,{\\an8\\pos(960,110)}Station sign`;

    const output = convertAssToVtt(source);

    expect(output.match(/00:00:10\.000 --> 00:00:13\.000/g)).toHaveLength(2);
    expect(output).toContain('First line\nSecond line');
    expect(output).toContain(
      '00:00:10.000 --> 00:00:13.000 line:10.185% position:50% align:center',
    );
  });

  it('uses style alignment and margins when a cue has no inline placement', () => {
    const source = `${HEADER.replace(
      'Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,2,30,30,35,1',
      'Style: Signs,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,8,30,30,40,1',
    )}\nDialogue: 0,0:00:08.00,0:00:09.00,Signs,,0,0,0,,Platform`;

    expect(convertAssToVtt(source)).toContain(
      '00:00:08.000 --> 00:00:09.000 line:3.704% position:50% align:center',
    );
  });

  it('suppresses vector-only drawing cues instead of rendering path coordinates as text', () => {
    const source = `${HEADER}\nDialogue: 0,0:00:12.00,0:00:14.00,Default,,0,0,0,,{\\an7\\pos(88,42)\\p1}m 0 0 l 120 0 120 64 0 64 b 0 0 4 8 12 16`;

    const output = convertAssToVtt(source);

    expect(output).toBe('WEBVTT\n\n');
    expect(output).not.toContain('m 0 0');
    expect(output).not.toContain('120 64');
  });

  it('keeps ordinary dialogue around drawing-mode spans and strips unsupported ASS tags', () => {
    const source = `${HEADER}\nDialogue: 0,0:00:15.00,0:00:18.00,Default,,0,0,0,,Before {\\p1\\clip(m 0 0 l 4 4)}m 0 0 l 80 80{\\p0\\move(0,0,200,200)\\t(0,500,\\frz45)} after`;

    const output = convertAssToVtt(source);

    expect(output).toContain('Before  after');
    expect(output).not.toContain('m 0 0');
    expect(output).not.toContain('\\move');
    expect(output).not.toContain('\\t(');
  });

  it('suppresses markerless FFmpeg drawing payloads while retaining nearby sign text', () => {
    const source = `${HEADER}
Dialogue: 4,0:01:56.51,0:01:56.55,Default,,0,0,0,,m 97.50 0.00 l 97.47 2.52 95.00 22.02 -97.50 0.00 b 4 8 12 16 20 24
Dialogue: 5,0:02:03.31,0:02:08.65,Default,,0,0,0,,Skills
Dialogue: 6,0:02:03.31,0:02:08.65,Default,,0,0,0,,m 0 0 l 800 0 800 2 0 2
Dialogue: 7,0:02:03.31,0:02:08.65,Default,,0,0,0,,Inspect VI; Self-Repair;`;

    const output = convertAssToVtt(source);

    expect(output).toContain('Skills');
    expect(output).toContain('Inspect VI; Self-Repair;');
    expect(output).not.toContain('m 97.50 0.00');
    expect(output).not.toContain('m 0 0 l 800');
  });
});
