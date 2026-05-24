import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PlayerPreparingPanel } from '../components/PlayerPreparingPanel';
import { PlayerPlaybackPage } from './PlayerPlaybackPage';
import type { User } from '../../shared/services/types';

interface PlayerPageProps {
  token: string;
  user: User;
  onLogout: () => void;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

export function PlayerPage({
  token,
  user,
  onLogout,
  hideTopNav = false,
  headerContent = null,
}: PlayerPageProps) {
  const { mediaId = '' } = useParams();
  const [searchParams] = useSearchParams();

  const prepareHash = searchParams.get('prepareHash')?.trim() ?? '';
  const fallbackTitle = searchParams.get('title') ?? '';

  if (prepareHash) {
    return (
      <PlayerPreparingPanel
        token={token}
        user={user}
        onLogout={onLogout}
        mediaId={mediaId}
        hash={prepareHash}
        fallbackTitle={fallbackTitle}
        hideTopNav={hideTopNav}
        headerContent={headerContent}
      />
    );
  }

  return (
    <PlayerPlaybackPage
      token={token}
      user={user}
      onLogout={onLogout}
      hideTopNav={hideTopNav}
      headerContent={headerContent}
    />
  );
}
