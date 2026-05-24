import type { FormEvent, ReactNode } from 'react';
import type { User } from '../../shared/services/types';
import { PlayerDetails } from './PlayerDetails';
import { PlayerDownloadProgress } from './PlayerDownloadProgress';
import { PlayerEpisodeNavigation } from './PlayerEpisodeNavigation';
import { PlayerStatusOverlay } from './PlayerStatusOverlay';
import { PlayerTopBar } from './PlayerTopBar';

interface PlayerPlaybackLayoutProps {
  playerPageClassName: string;
  hideTopNav: boolean;
  headerContent: ReactNode;
  playerTitle: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onOpenRandomDetails: () => void;
  user: User;
  onLogout: () => void;
  loading: boolean;
  switchingToHls: boolean;
  error: string | null;
  playerError: string | null;
  activeTheaterMode: boolean;
  videoPanelNode: ReactNode;
  episodeNavigationProps: React.ComponentProps<typeof PlayerEpisodeNavigation>;
  detailsProps: React.ComponentProps<typeof PlayerDetails>;
  downloadProgressProps: React.ComponentProps<typeof PlayerDownloadProgress>;
}

export function PlayerPlaybackLayout({
  playerPageClassName,
  hideTopNav,
  headerContent,
  playerTitle,
  query,
  onQueryChange,
  onSearchSubmit,
  onBack,
  onOpenRandomDetails,
  user,
  onLogout,
  loading,
  switchingToHls,
  error,
  playerError,
  activeTheaterMode,
  videoPanelNode,
  episodeNavigationProps,
  detailsProps,
  downloadProgressProps,
}: PlayerPlaybackLayoutProps) {
  return (
    <main className={playerPageClassName}>
      {headerContent}

      {!hideTopNav ? (
        <PlayerTopBar
          title={playerTitle}
          query={query}
          onQueryChange={onQueryChange}
          onSearchSubmit={onSearchSubmit}
          onBack={onBack}
          onOpenRandomDetails={onOpenRandomDetails}
          user={user}
          onLogout={onLogout}
        />
      ) : null}

      <PlayerStatusOverlay
        loading={loading}
        switchingToHls={switchingToHls}
        error={error}
        playerError={playerError}
      />

      <PlayerDownloadProgress {...downloadProgressProps} />

      <section className={`player-layout ${activeTheaterMode ? 'player-layout-theater' : ''}`}>
        {videoPanelNode}
      </section>

      <PlayerEpisodeNavigation {...episodeNavigationProps} />

      <PlayerDetails {...detailsProps} />
    </main>
  );
}
