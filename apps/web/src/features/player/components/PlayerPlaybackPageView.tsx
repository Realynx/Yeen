import type { FormEvent, ReactNode } from 'react';
import type { TorrentItem, User } from '../../shared/services/types';
import { PlayerPlaybackLayout } from './PlayerPlaybackLayout';
import { PlayerPanelContainer } from './PlayerPanelContainer';

interface PlayerPlaybackPageViewProps {
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
  panelProps: React.ComponentProps<typeof PlayerPanelContainer>;
  episodeNavigationProps: React.ComponentProps<typeof PlayerPlaybackLayout>['episodeNavigationProps'];
  detailsProps: React.ComponentProps<typeof PlayerPlaybackLayout>['detailsProps'];
  downloadingTorrent: TorrentItem | null;
}

export function PlayerPlaybackPageView({
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
  panelProps,
  episodeNavigationProps,
  detailsProps,
  downloadingTorrent,
}: PlayerPlaybackPageViewProps) {
  return (
    <PlayerPlaybackLayout
      playerPageClassName={playerPageClassName}
      hideTopNav={hideTopNav}
      isTvMode={isTvMode}
      headerContent={headerContent}
      playerTitle={playerTitle}
      query={query}
      onQueryChange={onQueryChange}
      onSearchSubmit={onSearchSubmit}
      onBack={onBack}
      onOpenRandomDetails={onOpenRandomDetails}
      user={user}
      onLogout={onLogout}
      loading={loading}
      switchingToHls={switchingToHls}
      error={error}
      playerError={playerError}
      activeTheaterMode={activeTheaterMode}
      videoPanelNode={<PlayerPanelContainer {...panelProps} />}
      episodeNavigationProps={episodeNavigationProps}
      detailsProps={detailsProps}
      downloadProgressProps={{
        torrent: downloadingTorrent,
      }}
    />
  );
}
