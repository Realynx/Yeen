import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { canAccessTorrentTools, isAdminRole } from './features/auth/services/roles';
import type { ClientExperience } from './features/navigation/services/clientExperience';
import type { User } from './features/shared/services/types';
import { HomePage } from './features/home/pages/HomePage';
import { HomePagePhone } from './features/home/pages/HomePagePhone';
import { HomePageTv } from './features/home/pages/HomePageTv';
import { MediaLibraryPage } from './features/library/pages/MediaLibraryPage';
import { MediaLibraryPagePhone } from './features/library/pages/MediaLibraryPagePhone';
import { MediaLibraryPageTv } from './features/library/pages/MediaLibraryPageTv';
import { MediaExplorePage } from './features/media-explore/pages/MediaExplorePage';
import { MediaExplorePagePhone } from './features/media-explore/pages/MediaExplorePagePhone';
import { MediaExplorePageTv } from './features/media-explore/pages/MediaExplorePageTv';
import { MediaDetailsPage } from './features/media-details/pages/MediaDetailsPage';
import { MediaDetailsPagePhone } from './features/media-details/pages/MediaDetailsPagePhone';
import { MediaDetailsPageTv } from './features/media-details/pages/MediaDetailsPageTv';
import { PlayerPage } from './features/player/pages/PlayerPage.tsx';
import { PlayerPagePhone } from './features/player/pages/PlayerPagePhone';
import { PlayerPageTv } from './features/player/pages/PlayerPageTv';
import { SettingsPage } from './features/settings/pages/SettingsPage';
import { SettingsPagePhone } from './features/settings/pages/SettingsPagePhone';
import { SettingsPageTv } from './features/settings/pages/SettingsPageTv';
import { SystemSettingsPage } from './features/settings/pages/SystemSettingsPage';
import { SystemSettingsPagePhone } from './features/settings/pages/SystemSettingsPagePhone';
import { SystemSettingsPageTv } from './features/settings/pages/SystemSettingsPageTv';
import { AccountAccessPage } from './features/settings/pages/AccountAccessPage';
import { AccountAccessPagePhone } from './features/settings/pages/AccountAccessPagePhone';
import { AccountAccessPageTv } from './features/settings/pages/AccountAccessPageTv';
import { DownloadControlPage } from './features/settings/pages/DownloadControlPage';
import { DownloadControlPagePhone } from './features/settings/pages/DownloadControlPagePhone';
import { DownloadControlPageTv } from './features/settings/pages/DownloadControlPageTv';

export interface AppCommonPageProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export interface ExperienceRouteDefinition {
  path: string;
  desktop: ReactElement;
  phone: ReactElement;
  tv?: ReactElement;
}

export interface GuardedExperienceRouteDefinition extends ExperienceRouteDefinition {
  allowed: boolean;
  redirectTo: string;
}

export function routeElementForExperience(
  experience: ClientExperience,
  route: ExperienceRouteDefinition,
): ReactElement {
  if (experience === 'tv') {
    return route.tv ?? route.desktop;
  }

  if (experience === 'phone') {
    return route.phone;
  }

  return route.desktop;
}

export function buildExperienceRoutes(
  commonPageProps: AppCommonPageProps,
  setUser: Dispatch<SetStateAction<User | null>>,
): ExperienceRouteDefinition[] {
  return [
    {
      path: '/',
      desktop: <HomePage {...commonPageProps} />,
      phone: <HomePagePhone {...commonPageProps} />,
      tv: <HomePageTv {...commonPageProps} />,
    },
    {
      path: '/settings',
      desktop: (
        <SettingsPage
          {...commonPageProps}
          onUserUpdated={setUser}
        />
      ),
      phone: (
        <SettingsPagePhone
          {...commonPageProps}
          onUserUpdated={setUser}
        />
      ),
      tv: (
        <SettingsPageTv
          {...commonPageProps}
          onUserUpdated={setUser}
        />
      ),
    },
    {
      path: '/library',
      desktop: <MediaLibraryPage {...commonPageProps} />,
      phone: <MediaLibraryPagePhone {...commonPageProps} />,
      tv: <MediaLibraryPageTv {...commonPageProps} />,
    },
    {
      path: '/explore',
      desktop: <MediaExplorePage {...commonPageProps} />,
      phone: <MediaExplorePagePhone {...commonPageProps} />,
      tv: <MediaExplorePageTv {...commonPageProps} />,
    },
    {
      path: '/details/:mediaId',
      desktop: <MediaDetailsPage {...commonPageProps} />,
      phone: <MediaDetailsPagePhone {...commonPageProps} />,
      tv: <MediaDetailsPageTv {...commonPageProps} />,
    },
    {
      path: '/player/:mediaId',
      desktop: <PlayerPage {...commonPageProps} />,
      phone: <PlayerPagePhone {...commonPageProps} />,
      tv: <PlayerPageTv {...commonPageProps} />,
    },
  ];
}

export function buildGuardedExperienceRoutes(
  commonPageProps: AppCommonPageProps,
  user: User,
): GuardedExperienceRouteDefinition[] {
  return [
    {
      path: '/admin/system',
      allowed: isAdminRole(user.role),
      redirectTo: '/settings',
      desktop: <SystemSettingsPage {...commonPageProps} />,
      phone: <SystemSettingsPagePhone {...commonPageProps} />,
      tv: <SystemSettingsPageTv {...commonPageProps} />,
    },
    {
      path: '/admin/accounts',
      allowed: isAdminRole(user.role),
      redirectTo: '/settings',
      desktop: <AccountAccessPage {...commonPageProps} />,
      phone: <AccountAccessPagePhone {...commonPageProps} />,
      tv: <AccountAccessPageTv {...commonPageProps} />,
    },
    {
      path: '/admin/downloads',
      allowed: canAccessTorrentTools(user.role),
      redirectTo: '/',
      desktop: <DownloadControlPage {...commonPageProps} />,
      phone: <DownloadControlPagePhone {...commonPageProps} />,
      tv: <DownloadControlPageTv {...commonPageProps} />,
    },
  ];
}
