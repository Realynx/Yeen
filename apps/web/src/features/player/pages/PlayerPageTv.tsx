import { createTvVariant } from '../../navigation/components/createTvVariant';
import type { User } from '../../shared/services/types';
import { PlayerPage } from './PlayerPage';

// The player owns initial focus (video surface and controls lifecycle),
// so we disable shell-level auto focus to avoid stealing focus on mount.
const PlayerPageTvBase = createTvVariant(PlayerPage, 'player', { autoFocusFirst: false });

interface PlayerPageTvProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function PlayerPageTv({ token, user, onLogout }: PlayerPageTvProps) {
  return <PlayerPageTvBase token={token} user={user} onLogout={onLogout} isTvMode />;
}
