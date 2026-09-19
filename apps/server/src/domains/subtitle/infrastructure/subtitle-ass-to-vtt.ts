import { isAssDrawingPayload } from './subtitle-drawing-payload';

const DEFAULT_PLAY_RESOLUTION = 384;
const ASS_OVERRIDE_BLOCK_PATTERN = /\{([^{}]*)\}/g;
const ASS_ALIGNMENT_PATTERN = /\\an([1-9])/g;
const ASS_POSITION_PATTERN =
  /\\pos\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/gi;
const ASS_MOVE_PATTERN =
  /\\move\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/gi;
const ASS_DRAWING_MODE_PATTERN = /\\p(\d+(?:\.\d+)?)/gi;

interface AssEventFormat {
  start: number;
  end: number;
  marginLeft: number;
  marginRight: number;
  marginVertical: number;
  style: number;
  text: number;
}

interface AssStyleFormat {
  name: number;
  alignment: number;
  marginLeft: number;
  marginRight: number;
  marginVertical: number;
}

interface AssStyle {
  alignment: number;
  marginLeft: number;
  marginRight: number;
  marginVertical: number;
}

interface AssPosition {
  x: number;
  y: number;
}

interface AssConversionState {
  section: string;
  playResX: number;
  playResY: number;
  eventFormat: AssEventFormat | null;
  eventFieldCount: number;
  styleFormat: AssStyleFormat | null;
  styles: Map<string, AssStyle>;
  cues: string[];
}

function parsePositiveNumber(
  rawValue: string | undefined,
  fallback: number,
): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMargin(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatPercent(value: number): string {
  return Number(clampPercent(value).toFixed(3)).toString();
}

function formatTimestamp(rawTimestamp: string): string | null {
  const match = rawTimestamp
    .trim()
    .match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ?? '0';
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }

  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    `${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`,
  ].join(':');
}

function parseFormat(rawFormat: string): AssEventFormat | null {
  const fields = rawFormat
    .split(',')
    .map((field) => field.trim().toLowerCase());
  const format: AssEventFormat = {
    start: fields.indexOf('start'),
    end: fields.indexOf('end'),
    marginLeft: fields.indexOf('marginl'),
    marginRight: fields.indexOf('marginr'),
    marginVertical: fields.indexOf('marginv'),
    style: fields.indexOf('style'),
    text: fields.indexOf('text'),
  };

  return format.start >= 0 && format.end >= 0 && format.text >= 0
    ? format
    : null;
}

function parseStyleFormat(rawFormat: string): AssStyleFormat | null {
  const fields = rawFormat
    .split(',')
    .map((field) => field.trim().toLowerCase());
  const format: AssStyleFormat = {
    name: fields.indexOf('name'),
    alignment: fields.indexOf('alignment'),
    marginLeft: fields.indexOf('marginl'),
    marginRight: fields.indexOf('marginr'),
    marginVertical: fields.indexOf('marginv'),
  };

  return format.name >= 0 && format.alignment >= 0 ? format : null;
}

function splitDialogueFields(
  rawDialogue: string,
  fieldCount: number,
): string[] {
  const fields: string[] = [];
  let remainder = rawDialogue;

  for (let index = 1; index < fieldCount; index += 1) {
    const separatorIndex = remainder.indexOf(',');
    if (separatorIndex < 0) {
      break;
    }

    fields.push(remainder.slice(0, separatorIndex));
    remainder = remainder.slice(separatorIndex + 1);
  }

  fields.push(remainder);
  return fields;
}

function lastMatchNumber(pattern: RegExp, text: string): number | null {
  pattern.lastIndex = 0;
  let value: number | null = null;

  for (const match of text.matchAll(pattern)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      value = parsed;
    }
  }

  return value;
}

function parseAlignment(rawText: string): number | null {
  const alignment = lastMatchNumber(ASS_ALIGNMENT_PATTERN, rawText);
  return alignment !== null && alignment >= 1 && alignment <= 9
    ? alignment
    : null;
}

function parsePosition(rawText: string): AssPosition | null {
  ASS_POSITION_PATTERN.lastIndex = 0;
  let position: AssPosition | null = null;

  for (const match of rawText.matchAll(ASS_POSITION_PATTERN)) {
    position = { x: Number(match[1]), y: Number(match[2]) };
  }

  if (position) {
    return position;
  }

  ASS_MOVE_PATTERN.lastIndex = 0;
  for (const match of rawText.matchAll(ASS_MOVE_PATTERN)) {
    position = { x: Number(match[1]), y: Number(match[2]) };
  }

  return position;
}

function toCueSettings(
  rawText: string,
  format: AssEventFormat,
  fields: string[],
  playResX: number,
  playResY: number,
  style: AssStyle | null,
): string {
  const alignment = parseAlignment(rawText) ?? style?.alignment ?? 2;
  const horizontalBand = alignment % 3;
  const verticalBand =
    alignment >= 7 ? 'top' : alignment >= 4 ? 'middle' : 'bottom';
  const explicitPosition = parsePosition(rawText);
  const margins = resolveCueMargins(format, fields, style);
  const placement = resolveCuePlacement(
    explicitPosition,
    horizontalBand,
    verticalBand,
    margins,
    playResX,
    playResY,
  );
  const cueAlignment =
    horizontalBand === 1 ? 'start' : horizontalBand === 2 ? 'center' : 'end';

  return `line:${formatPercent(placement.linePercent)}% position:${formatPercent(placement.positionPercent)}% align:${cueAlignment}`;
}

function resolveCueMargins(
  format: AssEventFormat,
  fields: string[],
  style: AssStyle | null,
): { left: number; right: number; vertical: number } {
  const eventMarginLeft = parseMargin(fields[format.marginLeft]);
  const eventMarginRight = parseMargin(fields[format.marginRight]);
  const eventMarginVertical = parseMargin(fields[format.marginVertical]);
  return {
    left: eventMarginLeft || style?.marginLeft || 0,
    right: eventMarginRight || style?.marginRight || 0,
    vertical: eventMarginVertical || style?.marginVertical || 0,
  };
}

function resolveCuePlacement(
  explicitPosition: AssPosition | null,
  horizontalBand: number,
  verticalBand: 'top' | 'middle' | 'bottom',
  margins: { left: number; right: number; vertical: number },
  playResX: number,
  playResY: number,
): { positionPercent: number; linePercent: number } {
  if (explicitPosition) {
    return {
      positionPercent: (explicitPosition.x / playResX) * 100,
      linePercent: (explicitPosition.y / playResY) * 100,
    };
  }
  return {
    positionPercent:
      horizontalBand === 1
        ? (margins.left / playResX) * 100
        : horizontalBand === 2
          ? 50
          : 100 - (margins.right / playResX) * 100,
    linePercent:
      verticalBand === 'top'
        ? (margins.vertical / playResY) * 100
        : verticalBand === 'middle'
          ? 50
          : 100 - (margins.vertical / playResY) * 100,
  };
}

function normalizeCueText(rawText: string): string {
  let drawingModeEnabled = false;
  let cursor = 0;
  let dialogueText = '';

  ASS_OVERRIDE_BLOCK_PATTERN.lastIndex = 0;
  for (const match of rawText.matchAll(ASS_OVERRIDE_BLOCK_PATTERN)) {
    const matchIndex = match.index ?? cursor;
    if (!drawingModeEnabled) {
      dialogueText += rawText.slice(cursor, matchIndex);
    }

    ASS_DRAWING_MODE_PATTERN.lastIndex = 0;
    for (const drawingModeMatch of (match[1] ?? '').matchAll(
      ASS_DRAWING_MODE_PATTERN,
    )) {
      drawingModeEnabled = Number(drawingModeMatch[1]) > 0;
    }

    cursor = matchIndex + match[0].length;
  }

  if (!drawingModeEnabled) {
    dialogueText += rawText.slice(cursor);
  }

  return dialogueText
    .replace(/\\N|\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !isAssDrawingPayload(line))
    .join('\n')
    .trim();
}

/**
 * Converts an ASS/SSA event stream into native WebVTT without flattening cue
 * placement. WebVTT cannot reproduce every libass animation or drawing, but
 * coordinates, numpad alignment, margins, overlapping cues, and line breaks
 * remain independently renderable by the browser.
 */
export function convertAssToVtt(content: string): string {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const state = createConversionState();
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    const section = parseSection(trimmed);
    if (section) {
      state.section = section;
      continue;
    }
    processSectionLine(state, line, trimmed);
  }
  return `WEBVTT\n\n${state.cues.join('\n\n')}${state.cues.length > 0 ? '\n' : ''}`;
}

function createConversionState(): AssConversionState {
  return {
    section: '',
    playResX: DEFAULT_PLAY_RESOLUTION,
    playResY: DEFAULT_PLAY_RESOLUTION,
    eventFormat: null,
    eventFieldCount: 0,
    styleFormat: null,
    styles: new Map<string, AssStyle>(),
    cues: [],
  };
}

function parseSection(line: string): string | null {
  const match = line.match(/^\[([^\]]+)]$/);
  return match ? match[1].trim().toLowerCase() : null;
}

function processSectionLine(
  state: AssConversionState,
  line: string,
  trimmed: string,
): void {
  if (state.section === 'script info') processScriptInfoLine(state, trimmed);
  else if (state.section === 'v4+ styles' || state.section === 'v4 styles')
    processStyleLine(state, line, trimmed);
  else if (state.section === 'events') processEventLine(state, line, trimmed);
}

function processScriptInfoLine(state: AssConversionState, line: string): void {
  const match = line.match(/^([^:]+):\s*(.*)$/);
  if (!match) return;
  const property = match[1].trim().toLowerCase();
  if (property === 'playresx')
    state.playResX = parsePositiveNumber(match[2], state.playResX);
  if (property === 'playresy')
    state.playResY = parsePositiveNumber(match[2], state.playResY);
}

function processStyleLine(
  state: AssConversionState,
  line: string,
  trimmed: string,
): void {
  const formatMatch = trimmed.match(/^Format:\s*(.*)$/i);
  if (formatMatch) {
    state.styleFormat = parseStyleFormat(formatMatch[1]);
    return;
  }
  const styleMatch = line.match(/^\s*Style:\s*(.*)$/i);
  if (!styleMatch || !state.styleFormat) return;
  const fields = styleMatch[1].split(',');
  const name = fields[state.styleFormat.name]?.trim().toLowerCase();
  const alignment = Number(fields[state.styleFormat.alignment]);
  if (!name || !Number.isFinite(alignment) || alignment < 1 || alignment > 9)
    return;
  state.styles.set(name, {
    alignment,
    marginLeft: parseMargin(fields[state.styleFormat.marginLeft]),
    marginRight: parseMargin(fields[state.styleFormat.marginRight]),
    marginVertical: parseMargin(fields[state.styleFormat.marginVertical]),
  });
}

function processEventLine(
  state: AssConversionState,
  line: string,
  trimmed: string,
): void {
  const formatMatch = trimmed.match(/^Format:\s*(.*)$/i);
  if (formatMatch) {
    state.eventFormat = parseFormat(formatMatch[1]);
    state.eventFieldCount = formatMatch[1].split(',').length;
    return;
  }
  const dialogueMatch = line.match(/^\s*Dialogue:\s*(.*)$/i);
  if (!dialogueMatch || !state.eventFormat || state.eventFieldCount <= 0)
    return;
  const fields = splitDialogueFields(dialogueMatch[1], state.eventFieldCount);
  if (fields.length !== state.eventFieldCount) return;
  const cue = buildCue(state, fields);
  if (cue) state.cues.push(cue);
}

function buildCue(state: AssConversionState, fields: string[]): string | null {
  const format = state.eventFormat;
  if (!format) return null;
  const start = formatTimestamp(fields[format.start]);
  const end = formatTimestamp(fields[format.end]);
  const rawText = fields[format.text] ?? '';
  const styleName = fields[format.style]?.trim().toLowerCase() ?? '';
  const cueText = normalizeCueText(rawText);
  if (!start || !end || !cueText) return null;
  const settings = toCueSettings(
    rawText,
    format,
    fields,
    state.playResX,
    state.playResY,
    state.styles.get(styleName) ?? null,
  );
  return `${start} --> ${end} ${settings}\n${cueText}`;
}
