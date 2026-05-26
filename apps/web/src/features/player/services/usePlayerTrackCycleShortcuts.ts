import { useEffect } from 'react';
import type {
  PlaybackAudioTrack,
  SubtitleTrack,
} from '../../shared/services/types';

interface UsePlayerTrackCycleShortcutsOptions {
  enabled: boolean;
  audioTracks: PlaybackAudioTrack[];
  selectedAudioStreamIndex: number | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string;
  onSelectAudioTrack: (audioStreamIndex: number) => void;
  onSelectSubtitle: (subtitleId: string) => void;
  onToggleNerdStats: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable
  );
}

export function usePlayerTrackCycleShortcuts({
  enabled,
  audioTracks,
  selectedAudioStreamIndex,
  subtitleTracks,
  selectedSubtitleId,
  onSelectAudioTrack,
  onSelectSubtitle,
  onToggleNerdStats,
}: UsePlayerTrackCycleShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function cycleAudioTrack() {
      if (audioTracks.length === 0) {
        return;
      }

      const currentIndex = audioTracks.findIndex(
        (track) => track.streamIndex === selectedAudioStreamIndex,
      );
      const nextTrack = audioTracks[(currentIndex + 1 + audioTracks.length) % audioTracks.length];
      if (nextTrack) {
        onSelectAudioTrack(nextTrack.streamIndex);
      }
    }

    function cycleSubtitleTrack() {
      const readyTracks = subtitleTracks.filter((track) => !!track.url);
      if (readyTracks.length === 0) {
        onSelectSubtitle('');
        return;
      }

      const currentIndex = readyTracks.findIndex((track) => track.id === selectedSubtitleId);
      const nextTrack = currentIndex < 0
        ? readyTracks[0]
        : readyTracks[currentIndex + 1] ?? null;
      onSelectSubtitle(nextTrack?.id ?? '');
    }

    function handleTrackShortcut(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'a' || key === 'audiotrack') {
        event.preventDefault();
        cycleAudioTrack();
      } else if (key === 's' || key === 'subtitle') {
        event.preventDefault();
        cycleSubtitleTrack();
      } else if (key === 'i' || key === 'info') {
        event.preventDefault();
        onToggleNerdStats();
      }
    }

    window.addEventListener('keydown', handleTrackShortcut);
    return () => {
      window.removeEventListener('keydown', handleTrackShortcut);
    };
  }, [
    audioTracks,
    enabled,
    onSelectAudioTrack,
    onSelectSubtitle,
    onToggleNerdStats,
    selectedAudioStreamIndex,
    selectedSubtitleId,
    subtitleTracks,
  ]);
}
