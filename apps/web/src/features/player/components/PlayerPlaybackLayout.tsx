import type { FormEvent, ReactNode } from 'react';
import type { User } from '../../shared/services/types';
import { PlayerDetails } from './PlayerDetails';
import { PlayerEpisodeNavigation } from './PlayerEpisodeNavigation';
import { PlayerStatusOverlay } from './PlayerStatusOverlay';
import { PlayerTopBar } from './PlayerTopBar';
import { AddonPlaybackStatusSurfaces } from '../../addons/runtime/AddonHostSlots';

interface PlayerPlaybackLayoutProps {
  playerPageClassName: string;
  hideTopNav: boolean;
  isTvMode: boolean;
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
  preparation: unknown;
}

export function PlayerPlaybackLayout({
  playerPageClassName,
  hideTopNav,
  isTvMode,
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
  preparation,
}: PlayerPlaybackLayoutProps) {
  return (
    <main className={playerPageClassName}>
      {headerContent}

      {!hideTopNav && !isTvMode ? (
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

      {!isTvMode ? (
        <PlayerStatusOverlay
          loading={loading}
          switchingToHls={switchingToHls}
          error={error}
          playerError={playerError}
        />
      ) : null}

      {!isTvMode ? <AddonPlaybackStatusSurfaces preparation={preparation} /> : null}

      <section className={`player-layout ${activeTheaterMode ? 'player-layout-theater' : ''}`}>
        {videoPanelNode}
      </section>

      {!isTvMode ? <PlayerEpisodeNavigation {...episodeNavigationProps} /> : null}

      {!isTvMode ? <PlayerDetails {...detailsProps} /> : null}
    </main>
  );
}
