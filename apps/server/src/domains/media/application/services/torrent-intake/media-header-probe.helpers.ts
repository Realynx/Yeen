import {
  readMediaFileHeader,
  scoreMediaHeader as scoreSharedMediaHeader,
} from '../../../../core/infrastructure/shared/media-header-probe';

/**
 * Classify whether a probe error is recoverable (i.e., likely due to incomplete
 * file download or temporary I/O issues) vs. fatal (corrupted file or unsupported format).
 */
export function isRecoverableTorrentProbeErrorValue(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid data found') ||
    normalized.includes('end of file') ||
    normalized.includes('error reading') ||
    normalized.includes('moov atom not found')
  );
}

/**
 * Read the first N bytes of a media file to inspect the container header.
 */
export async function readFileHeaderValue(
  filePath: string,
  byteCount: number,
): Promise<Buffer | null> {
  return await readMediaFileHeader(filePath, byteCount);
}

/**
 * Score a media file header to determine if it's a valid container.
 * Higher scores indicate more confident container signatures.
 */
export function scoreMediaHeaderValue(
  header: Buffer | null,
  fileSize: number,
): number {
  return scoreSharedMediaHeader(header, fileSize);
}
