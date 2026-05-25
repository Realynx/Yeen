import { describe, expect, it } from 'vitest';
import type { SubtitleTrack } from '../../shared/services/types';
import {
  pickPreferredSubtitleTrack,
  pickPreferredSubtitleTrackId,
  pickPreferredSubtitleTrackToExtract,
} from './playerDataPreferences';

function createTrack(partial: Partial<SubtitleTrack> & { id: string }): SubtitleTrack {
  return {
    id: partial.id,
    kind: partial.kind ?? 'embedded',
    label: partial.label ?? partial.id,
    language: partial.language ?? null,
    format: partial.format ?? 'srt',
    extractable: partial.extractable ?? false,
    streamIndex: partial.streamIndex,
    url: partial.url ?? null,
  };
}

describe('playerDataPreferences subtitle helpers', () => {
  it('picks extracted preferred subtitle ID when available', () => {
    const tracks: SubtitleTrack[] = [
      createTrack({ id: 'ja-embedded', language: 'ja', extractable: true, streamIndex: 2 }),
      createTrack({ id: 'ja-external', language: 'ja-JP', kind: 'external', url: '/subs/ja.vtt' }),
      createTrack({ id: 'en-external', language: 'en', kind: 'external', url: '/subs/en.vtt' }),
    ];

    expect(pickPreferredSubtitleTrackId(tracks, 'ja')).toBe('ja-external');
  });

  it('returns preferred track to extract when preferred subtitle exists but is not extracted', () => {
    const tracks: SubtitleTrack[] = [
      createTrack({ id: 'ja-embedded', language: 'ja', extractable: true, streamIndex: 2 }),
      createTrack({ id: 'en-external', language: 'en', kind: 'external', url: '/subs/en.vtt' }),
    ];

    expect(pickPreferredSubtitleTrackToExtract(tracks, 'ja')?.id).toBe('ja-embedded');
  });

  it('does not request extraction when preferred language already has extracted subtitles', () => {
    const tracks: SubtitleTrack[] = [
      createTrack({ id: 'ja-embedded', language: 'ja', extractable: true, streamIndex: 2 }),
      createTrack({ id: 'ja-external', language: 'ja', kind: 'external', url: '/subs/ja.vtt' }),
    ];

    expect(pickPreferredSubtitleTrackToExtract(tracks, 'ja')).toBeNull();
  });

  it('matches preferred subtitle by base language', () => {
    const tracks: SubtitleTrack[] = [
      createTrack({ id: 'eng-track', language: 'en', kind: 'external', url: '/subs/en.vtt' }),
    ];

    expect(
      pickPreferredSubtitleTrack(tracks, 'en-US', {
        requireUrl: true,
      })?.id,
    ).toBe('eng-track');
  });
});
