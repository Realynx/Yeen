import { createTvVariant } from '../../navigation/components/createTvVariant';
import type { User } from '../../shared/services/types';
import { PlayerPage } from './PlayerPage';

const PlayerPageTvBase = createTvVariant(PlayerPage, 'player');

interface PlayerPageTvProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function PlayerPageTv({ token, user, onLogout }: PlayerPageTvProps) {
  return <PlayerPageTvBase token={token} user={user} onLogout={onLogout} isTvMode />;
}
