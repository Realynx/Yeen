const ASS_DRAWING_COMMANDS = new Set(['m', 'n', 'l', 'b', 's', 'p', 'c']);
const ASS_DRAWING_NUMBER_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Detects an ASS vector path after FFmpeg has discarded the original `\p`
 * drawing-mode override. A valid drawing payload consists exclusively of ASS
 * path commands and coordinates; ordinary dialogue is therefore preserved.
 */
export function isAssDrawingPayload(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 5 || tokens[0].toLowerCase() !== 'm') return false;

  let commandCount = 0;
  let numberCount = 0;
  for (const token of tokens) {
    if (ASS_DRAWING_COMMANDS.has(token.toLowerCase())) {
      commandCount += 1;
    } else if (ASS_DRAWING_NUMBER_PATTERN.test(token)) {
      numberCount += 1;
    } else {
      return false;
    }
  }

  return commandCount >= 2 && numberCount >= 4;
}
