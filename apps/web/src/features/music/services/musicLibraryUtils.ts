import type { MediaItem } from '../../shared/services/types';

export interface MusicAlbumGroup {
  id: string;
  title: string;
  artist: string;
  artworkItem: MediaItem;
  tracks: MediaItem[];
}

export function isMusicItem(item: MediaItem): boolean {
  return item.libraryType === 'music' || item.digitalMediaType === 'audio';
}

export function musicArtist(item: MediaItem): string {
  return cleanLabel(item.musicMetadata?.artist)
    ?? cleanLabel(item.musicMetadata?.albumArtist)
    ?? 'Unknown Artist';
}

export function musicAlbum(item: MediaItem): string {
  return cleanLabel(item.musicMetadata?.album) ?? 'Unknown Album';
}

export function musicGenre(item: MediaItem): string {
  return cleanLabel(item.musicMetadata?.genre)
    ?? cleanLabel(item.tags.find((tag) => tag.trim().length > 0))
    ?? 'Music';
}

export function musicTrackNumber(item: MediaItem): number | null {
  const value = item.musicMetadata?.trackNumber;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function formatMusicDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function groupMusicAlbums(items: MediaItem[]): MusicAlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();

  for (const item of items.filter(isMusicItem)) {
    const artist = cleanLabel(item.musicMetadata?.albumArtist) ?? musicArtist(item);
    const album = musicAlbum(item);
    const key = `${artist.toLocaleLowerCase()}\u0000${album.toLocaleLowerCase()}`;
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([id, tracks]) => {
      const sortedTracks = [...tracks].sort(compareMusicTracks);
      const firstTrack = sortedTracks[0]!;
      return {
        id,
        title: musicAlbum(firstTrack),
        artist: cleanLabel(firstTrack.musicMetadata?.albumArtist) ?? musicArtist(firstTrack),
        artworkItem: tracks.find((track) => track.previewImagePath) ?? firstTrack,
        tracks: sortedTracks,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function compareMusicTracks(left: MediaItem, right: MediaItem): number {
  const leftDisc = left.musicMetadata?.discNumber ?? 1;
  const rightDisc = right.musicMetadata?.discNumber ?? 1;
  if (leftDisc !== rightDisc) {
    return leftDisc - rightDisc;
  }

  const leftTrack = musicTrackNumber(left) ?? Number.MAX_SAFE_INTEGER;
  const rightTrack = musicTrackNumber(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftTrack !== rightTrack) {
    return leftTrack - rightTrack;
  }

  return left.title.localeCompare(right.title);
}

export function filterMusicItems(items: MediaItem[], query: string): MediaItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return items.filter(isMusicItem);
  }

  return items.filter((item) => {
    if (!isMusicItem(item)) {
      return false;
    }

    return [item.title, musicArtist(item), musicAlbum(item), musicGenre(item)]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function filterMusicItemsByArtist(
  items: MediaItem[],
  artist: string | null,
): MediaItem[] {
  const normalizedArtist = artist?.trim().toLocaleLowerCase() ?? '';
  if (!normalizedArtist) {
    return items.filter(isMusicItem);
  }

  return items.filter((item) =>
    isMusicItem(item)
    && musicArtist(item).toLocaleLowerCase() === normalizedArtist);
}

function cleanLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
