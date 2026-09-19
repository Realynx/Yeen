import type { RemoteMusicResult } from '@yeen/shared-contracts';
import { AddonRemoteMusicResultActions } from '../../addons/runtime/AddonHostSlots';
import { formatMusicDuration } from '../services/musicLibraryUtils';

export function RemoteMusicResultsSection({
  query,
  items,
  loading,
  error,
  onRetry,
  onClear,
}: {
  query: string;
  items: RemoteMusicResult[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClear: () => void;
}) {
  if (!query) return null;

  return (
    <section className="music-section music-remote-section" aria-labelledby="music-remote-heading">
      <div className="music-section-heading">
        <div>
          <p>Beyond your library</p>
          <h2 id="music-remote-heading">Around the web</h2>
        </div>
        <button type="button" className="music-text-action" onClick={onClear}>Close results</button>
      </div>
      <p className="music-remote-summary">
        Results for “{query}” from configured music providers. Remote tracks are never added automatically.
      </p>
      {loading ? <RemoteMusicLoadingState label="Searching music providers…" /> : null}
      {error ? <RemoteMusicErrorState message={error} onRetry={onRetry} /> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="music-state-message" role="status">No remote matches found. Try another song or artist.</p>
      ) : null}
      {!loading && !error && items.length > 0 ? <RemoteMusicGrid items={items} /> : null}
    </section>
  );
}

export function MusicDiscoverSection({
  items,
  generatedAt,
  loading,
  error,
  onRetry,
}: {
  items: RemoteMusicResult[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section className="music-section music-remote-section" id="music-discover" aria-labelledby="music-discover-heading">
      <div className="music-section-heading">
        <div>
          <p>Charts and trends</p>
          <h2 id="music-discover-heading">Discover</h2>
        </div>
        {generatedAt ? (
          <span className="music-feed-updated">Updated {formatFeedDate(generatedAt)}</span>
        ) : null}
      </div>
      <p className="music-remote-summary">Find something new from configured metadata providers.</p>
      {loading ? <RemoteMusicLoadingState label="Loading Discover…" /> : null}
      {error ? <RemoteMusicErrorState message={error} onRetry={onRetry} /> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="music-state-message">No fresh chart data is available right now.</p>
      ) : null}
      {!loading && !error && items.length > 0 ? <RemoteMusicGrid items={items} /> : null}
    </section>
  );
}

export function RemoteMusicGrid({ items }: { items: RemoteMusicResult[] }) {
  return (
    <div className="music-remote-grid">
      {items.map((item) => <RemoteMusicCard item={item} key={item.id} />)}
    </div>
  );
}

export function RemoteMusicCard({ item }: { item: RemoteMusicResult }) {
  const sourceLink = firstSafeSourceLink(item);
  return (
    <article className="music-remote-card">
      <RemoteMusicArtwork item={item} />
      <div className="music-remote-card-body">
        <div className="music-remote-card-heading">
          <div>
            <h3>{item.title}</h3>
            <p>{item.artists.join(', ') || 'Unknown artist'}</p>
          </div>
          {item.localMediaId ? <span className="music-local-match">In your library</span> : null}
        </div>
        <p className="music-remote-details">
          {[item.album, item.releaseYear, formatRemoteDuration(item.durationSeconds)]
            .filter(Boolean)
            .join(' · ') || 'Track details unavailable'}
        </p>
        <div className="music-provider-chips" aria-label="Sources">
          {[...new Set(item.sources.map((source) => source.provider))].map((provider) => (
            <span key={provider}>{providerLabel(provider)}</span>
          ))}
        </div>
        <div className="music-remote-actions">
          {sourceLink ? (
            <a href={sourceLink.url} target="_blank" rel="noreferrer">
              View on {providerLabel(sourceLink.provider)}
            </a>
          ) : null}
          <AddonRemoteMusicResultActions remoteMusicResult={item} />
        </div>
      </div>
    </article>
  );
}

function RemoteMusicArtwork({ item }: { item: RemoteMusicResult }) {
  return (
    <div className="music-artwork music-remote-artwork">
      {safeHttpUrl(item.artworkUrl) ? (
        <img src={item.artworkUrl!} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : <span aria-hidden="true">♫</span>}
    </div>
  );
}

function RemoteMusicLoadingState({ label }: { label: string }) {
  return (
    <div className="music-remote-loading" role="status">
      <span className="music-loading-label">{label}</span>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </div>
  );
}

function RemoteMusicErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="music-remote-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

function firstSafeSourceLink(item: RemoteMusicResult) {
  return item.sources.find((source) => safeHttpUrl(source.url));
}

function safeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function providerLabel(provider: string): string {
  if (provider === 'theaudiodb') return 'TheAudioDB';
  if (provider === 'youtube') return 'YouTube';
  if (provider === 'soundcloud') return 'SoundCloud';
  if (provider === 'spotify') return 'Spotify';
  return provider;
}

function formatRemoteDuration(durationSeconds: number | null): string | null {
  return durationSeconds && durationSeconds > 0 ? formatMusicDuration(durationSeconds) : null;
}

function formatFeedDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'recently'
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
