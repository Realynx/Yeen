import type { ReactNode } from 'react';
import { PlayerPlaybackPage } from './PlayerPlaybackPage';
import type { User } from '../../shared/services/types';
import { AddonPreparationBoundary } from '../../addons/runtime/AddonHostSlots';

interface PlayerPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
  isTvMode?: boolean;
}

export function PlayerPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
  isTvMode = false,
}: PlayerPageProps) {
  return (
    <AddonPreparationBoundary headerContent={headerContent}>
      <PlayerPlaybackPage
        token={token}
        user={user}
        onLogout={onLogout}
        hideTopNav={hideTopNav}
        headerContent={headerContent}
        isTvMode={isTvMode}
      />
    </AddonPreparationBoundary>
  );
}
