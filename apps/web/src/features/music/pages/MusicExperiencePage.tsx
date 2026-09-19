import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMedia, toApiErrorMessage } from '../../shared/services/api';
import type { MediaItem, User } from '../../shared/services/types';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import { MusicArtwork } from '../components/MusicArtwork';
import { MusicPlayerDock } from '../components/MusicPlayerDock';
import {
  MusicDiscoverSection,
  RemoteMusicResultsSection,
} from '../components/RemoteMusicSections';
import {
  filterMusicItems,
  filterMusicItemsByArtist,
  formatMusicDuration,
  groupMusicAlbums,
  musicAlbum,
  musicArtist,
  musicGenre,
  musicTrackNumber,
} from '../services/musicLibraryUtils';
import { useMusicPlayback } from '../services/useMusicPlayback';
import { useRemoteMusicCatalog } from '../services/useRemoteMusicCatalog';
import '../../../styles/layouts/music-experience.css';
import { MediaModeSwitchSlot } from '../../media-mode/components/MediaModeSwitcher';
import { MediaHomeButton } from '../../navigation/components/MediaHomeButton';

interface MusicExperiencePageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function MusicExperiencePage({ token, user, onLogout }: MusicExperiencePageProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMusicLibrary() {
      setLoading(true);
      setError(null);
      try {
        const response = await listMedia(token, undefined, undefined, 'music');
        if (!cancelled) {
          setItems(response.filter((item) =>
            item.libraryType === 'music' || item.digitalMediaType === 'audio'));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(toApiErrorMessage(loadError, 'Unable to load your music library.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMusicLibrary();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredItems = useMemo(
    () => filterMusicItemsByArtist(filterMusicItems(items, query), selectedArtist),
    [items, query, selectedArtist],
  );
  const albums = useMemo(() => groupMusicAlbums(filteredItems), [filteredItems]);
  const recentlyAdded = useMemo(
    () => [...filteredItems]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8),
    [filteredItems],
  );
  const artists = useMemo(
    () => [...new Set(items.map(musicArtist))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const playback = useMusicPlayback(token, user.id, items);
  const remoteCatalog = useRemoteMusicCatalog(token);
  const greeting = greetingForCurrentTime();

  return (
    <div className="music-experience">
      <MusicSidebar
        artists={artists}
        selectedArtist={selectedArtist}
        onSelectArtist={setSelectedArtist}
      />

      <main className="music-main" id="music-home">
        <MusicTopbar
          query={query}
          searchingRemote={remoteCatalog.searchLoading}
          user={user}
          onQueryChange={setQuery}
          onRemoteSearch={() => void remoteCatalog.search(query)}
          onLogout={onLogout}
        />
        <MusicHero
          greeting={greeting}
          trackCount={items.length}
          albumCount={albums.length}
          artistCount={artists.length}
        />
        <MusicLibraryContent
          items={items}
          filteredItems={filteredItems}
          recentlyAdded={recentlyAdded}
          albums={albums}
          query={query}
          loading={loading}
          error={error}
          playback={playback}
          onClearQuery={() => setQuery('')}
        />

        <RemoteMusicResultsSection
          query={remoteCatalog.searchQuery}
          items={musicResponseItems(remoteCatalog.searchResponse)}
          loading={remoteCatalog.searchLoading}
          error={remoteCatalog.searchError}
          onRetry={() => void remoteCatalog.search(remoteCatalog.searchQuery)}
          onClear={remoteCatalog.clearSearch}
        />

        <MusicDiscoverSection
          items={musicResponseItems(remoteCatalog.discoverResponse)}
          generatedAt={musicDiscoverGeneratedAt(remoteCatalog.discoverResponse)}
          loading={remoteCatalog.discoverLoading}
          error={remoteCatalog.discoverError}
          onRetry={remoteCatalog.discover}
        />
      </main>

      <MusicPlayerDock
        audioRef={playback.audioRef}
        track={playback.currentTrack}
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        volume={playback.volume}
        error={playback.error}
        onPrevious={playback.playPrevious}
        onTogglePlayback={playback.togglePlayback}
        onNext={playback.playNext}
        onSeek={playback.seek}
        onVolumeChange={playback.setVolume}
        audioEvents={playback.audioEvents}
      />
    </div>
  );
}

type MusicPlaybackController = ReturnType<typeof useMusicPlayback>;
type MusicAlbumGroup = ReturnType<typeof groupMusicAlbums>[number];

function MusicSidebar({
  artists,
  selectedArtist,
  onSelectArtist,
}: {
  artists: string[];
  selectedArtist: string | null;
  onSelectArtist: (artist: string | null) => void;
}) {
  return (
    <aside className="music-sidebar">
      <div className="music-brand">
        <span className="music-brand-mark" aria-hidden="true">Y</span>
        <div><strong>Yeen</strong><span>Music</span></div>
      </div>
      <nav aria-label="Music">
        <a href="#music-home"><span aria-hidden="true">⌂</span>Home</a>
        <a href="#music-search"><span aria-hidden="true">⌕</span>Search</a>
        <a href="#music-discover"><span aria-hidden="true">✦</span>Discover</a>
        <a href="#music-library"><span aria-hidden="true">▥</span>Library</a>
      </nav>
      <section className="music-sidebar-library" aria-labelledby="music-sidebar-library-title">
        <p id="music-sidebar-library-title">Artists</p>
        {selectedArtist ? (
          <button type="button" className="music-artist-clear" onClick={() => onSelectArtist(null)}>
            Show all artists
          </button>
        ) : null}
        {artists.map((artist) => (
          <MusicArtistFilter
            artist={artist}
            selected={selectedArtist === artist}
            onSelect={onSelectArtist}
            key={artist}
          />
        ))}
        {artists.length === 0 ? <span>Run a Media Scan to add artists.</span> : null}
      </section>
    </aside>
  );
}

function MusicArtistFilter({
  artist,
  selected,
  onSelect,
}: {
  artist: string;
  selected: boolean;
  onSelect: (artist: string | null) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? 'is-active' : ''}
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : artist)}
    >
      {artist}
    </button>
  );
}

function MusicTopbar({
  query,
  searchingRemote,
  user,
  onQueryChange,
  onRemoteSearch,
  onLogout,
}: {
  query: string;
  searchingRemote: boolean;
  user: User;
  onQueryChange: (query: string) => void;
  onRemoteSearch: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="music-topbar">
      <MediaHomeButton />
      <MediaModeSwitchSlot placement="music-header" />
      <form
        className="music-search-form"
        id="music-search"
        onSubmit={(event) => {
          event.preventDefault();
          onRemoteSearch();
        }}
      >
        <label className="music-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search your library"
            aria-label="Search your music library"
          />
        </label>
        <button type="submit" disabled={!query.trim() || searchingRemote}>
          {searchingRemote ? 'Searching…' : 'Search web'}
        </button>
      </form>
      <ProfileMenu user={user} onLogout={onLogout} />
    </header>
  );
}

function MusicHero({
  greeting,
  trackCount,
  albumCount,
  artistCount,
}: {
  greeting: string;
  trackCount: number;
  albumCount: number;
  artistCount: number;
}) {
  return (
    <section className="music-hero">
      <p>{greeting}</p>
      <h1>Your music, uninterrupted.</h1>
      <span>{trackCount} tracks · {albumCount} albums · {artistCount} artists</span>
    </section>
  );
}

function MusicLibraryContent({
  items,
  filteredItems,
  recentlyAdded,
  albums,
  query,
  loading,
  error,
  playback,
  onClearQuery,
}: {
  items: MediaItem[];
  filteredItems: MediaItem[];
  recentlyAdded: MediaItem[];
  albums: MusicAlbumGroup[];
  query: string;
  loading: boolean;
  error: string | null;
  playback: MusicPlaybackController;
  onClearQuery: () => void;
}) {
  return (
    <>
      {error ? <p className="music-state-message error-text" role="alert">{error}</p> : null}
      {loading ? <MusicLoadingState /> : null}
      {!loading && !error && items.length === 0 ? <MusicEmptyState /> : null}
      {!loading && !error && items.length > 0 && filteredItems.length === 0 ? (
        <MusicNoResultsState query={query} onClear={onClearQuery} />
      ) : null}
      {!loading && filteredItems.length > 0 ? (
        <MusicLibrarySections
          filteredItems={filteredItems}
          recentlyAdded={recentlyAdded}
          albums={albums}
          playback={playback}
        />
      ) : null}
    </>
  );
}

function MusicLibrarySections({
  filteredItems,
  recentlyAdded,
  albums,
  playback,
}: {
  filteredItems: MediaItem[];
  recentlyAdded: MediaItem[];
  albums: MusicAlbumGroup[];
  playback: MusicPlaybackController;
}) {
  return (
    <>
      <MusicRecentlyAdded items={recentlyAdded} playback={playback} />
      <MusicAlbums albums={albums} playback={playback} />
      <MusicTracks items={filteredItems} playback={playback} />
    </>
  );
}

function MusicRecentlyAdded({
  items,
  playback,
}: {
  items: MediaItem[];
  playback: MusicPlaybackController;
}) {
  return (
    <section className="music-section" aria-labelledby="music-recent-heading">
      <div className="music-section-heading">
        <div><p>Made from your library</p><h2 id="music-recent-heading">Recently added</h2></div>
      </div>
      <div className="music-card-grid">
        {items.map((item) => (
          <button type="button" className="music-card" key={item.id} onClick={() => void playback.playTrack(item)}>
            <MusicArtwork item={item} />
            <strong>{item.title}</strong>
            <span>{musicArtist(item)}</span>
            <i aria-hidden="true">▶</i>
          </button>
        ))}
      </div>
    </section>
  );
}

function MusicAlbums({
  albums,
  playback,
}: {
  albums: MusicAlbumGroup[];
  playback: MusicPlaybackController;
}) {
  return (
    <section className="music-section" id="music-library" aria-labelledby="music-albums-heading">
      <div className="music-section-heading">
        <div><p>Your collection</p><h2 id="music-albums-heading">Albums</h2></div>
      </div>
      <div className="music-card-grid is-albums">
        {albums.map((album) => (
          <button type="button" className="music-card" key={album.id} onClick={() => void playback.playTrack(album.tracks[0])}>
            <MusicArtwork item={album.artworkItem} />
            <strong>{album.title}</strong>
            <span>{album.artist} · {album.tracks.length} tracks</span>
            <i aria-hidden="true">▶</i>
          </button>
        ))}
      </div>
    </section>
  );
}

function MusicTracks({
  items,
  playback,
}: {
  items: MediaItem[];
  playback: MusicPlaybackController;
}) {
  return (
    <section className="music-track-section" aria-labelledby="music-tracks-heading">
      <div className="music-section-heading">
        <div><p>All songs</p><h2 id="music-tracks-heading">Tracks</h2></div>
      </div>
      <div className="music-track-list">
        <div className="music-track-row is-header" aria-hidden="true">
          <span>#</span><span>Title</span>
          <span>Album</span><span>Genre</span>
          <span>Duration</span>
        </div>
        {items.map((item, index) => (
          <MusicTrackRow item={item} index={index} playback={playback} key={item.id} />
        ))}
      </div>
    </section>
  );
}

function MusicTrackRow({
  item,
  index,
  playback,
}: {
  item: MediaItem;
  index: number;
  playback: MusicPlaybackController;
}) {
  const active = playback.currentTrackId === item.id;
  return (
    <button
      type="button"
      className={`music-track-row ${active ? 'is-active' : ''}`}
      aria-label={`${playback.loadingTrackId === item.id ? 'Loading' : 'Play'} ${item.title} by ${musicArtist(item)}`}
      aria-pressed={active}
      onClick={() => void playback.playTrack(item)}
    >
      <span className="music-track-number">
        {playback.loadingTrackId === item.id ? '…' : active && playback.isPlaying ? '♫' : musicTrackNumber(item) ?? index + 1}
      </span>
      <span className="music-track-title">
        <MusicArtwork item={item} className="is-track-art" />
        <span><strong>{item.title}</strong><small>{musicArtist(item)}</small></span>
      </span>
      <span>{musicAlbum(item)}</span>
      <span>{musicGenre(item)}</span>
      <span>{formatMusicDuration(item.durationSeconds)}</span>
    </button>
  );
}

function musicResponseItems<T>(
  response: { items: T[] } | null,
): T[] {
  return response ? response.items : [];
}

function musicDiscoverGeneratedAt(
  response: { generatedAt: string } | null,
): string | null {
  return response ? response.generatedAt : null;
}

function MusicLoadingState() {
  return (
    <div className="music-loading" role="status">
      <span className="music-loading-label">Loading music…</span>
      <span aria-hidden="true" /><span aria-hidden="true" />
      <span aria-hidden="true" /><span aria-hidden="true" />
    </div>
  );
}

function MusicEmptyState() {
  return (
    <section className="music-empty-state">
      <span aria-hidden="true">♫</span>
      <h2>Your music shelf is ready.</h2>
      <p>Add a Music location containing FLAC, MP3, M4A, AAC, OGG, Opus, or WAV files to Media Locations, then run a Media Scan.</p>
      <Link to="/settings">Open Media Locations</Link>
    </section>
  );
}

function MusicNoResultsState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <section className="music-empty-state music-no-results" aria-live="polite">
      <h2>No matches for “{query.trim()}”</h2>
      <p>Try another song, artist, album, or genre.</p>
      <button type="button" onClick={onClear}>Clear search</button>
    </section>
  );
}

function greetingForCurrentTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
