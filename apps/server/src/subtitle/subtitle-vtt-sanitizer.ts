import { readFile, writeFile } from 'node:fs/promises';

const ASS_OVERRIDE_BLOCK_PATTERN = /\{[^{}]*\\[^{}]*\}/g;
const BRACE_BLOCK_PATTERN = /\{[^{}]*\}/g;
const ASS_NEWLINE_PATTERN = /\\N|\\n/g;
const ASS_HARD_SPACE_PATTERN = /\\h/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const INVISIBLE_CUE_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g;

function isCueTextLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.toUpperCase().startsWith('WEBVTT')) {
    return false;
  }

  if (
    trimmed.startsWith('NOTE')
    || trimmed.startsWith('STYLE')
    || trimmed.startsWith('REGION')
  ) {
    return false;
  }

  if (trimmed.includes('-->')) {
    return false;
  }

  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  return true;
}

function sanitizeCueLine(line: string): string {
  return line
    .replace(ASS_NEWLINE_PATTERN, ' ')
    .replace(ASS_HARD_SPACE_PATTERN, ' ')
    .replace(ASS_OVERRIDE_BLOCK_PATTERN, '')
    .replace(BRACE_BLOCK_PATTERN, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(INVISIBLE_CUE_CHARS_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function sanitizeVttContent(content: string): string {
  const normalizedNewlines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalizedNewlines.split('\n');
  const sanitizedLines = lines.map((line) => {
    if (!isCueTextLine(line)) {
      return line;
    }

    return sanitizeCueLine(line);
  });

  return sanitizedLines.join('\n');
}

export async function sanitizeVttFile(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath, 'utf8');
  const sanitized = sanitizeVttContent(raw);

  if (sanitized === raw) {
    return false;
  }

  await writeFile(filePath, sanitized, 'utf8');
  return true;
}