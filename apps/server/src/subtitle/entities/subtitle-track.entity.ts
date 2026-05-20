export interface SubtitleTrack {
  id: string;
  kind: 'embedded' | 'external';
  label: string;
  language: string | null;
  format: string;
  extractable: boolean;
  streamIndex?: number;
  url: string | null;
}
