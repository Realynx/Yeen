import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useParams,
} from 'react-router-dom';
import { AuthPanel } from './features/auth/components/AuthPanel';
import { InviteSignupPanel } from './features/auth/components/InviteSignupPanel';
import { TvPairingAuthPanel } from './features/auth/components/TvPairingAuthPanel';
import { TvInstallPanel } from './features/auth/components/TvInstallPanel';
import { TOKEN_STORAGE_KEY, me } from './features/shared/services/api';
import { useClientExperience } from './features/navigation/services/clientExperience';
import type { AuthResponse, User } from './features/shared/services/types';
import { canAccessTorrentTools, isAdminRole } from './features/auth/services/roles';
import { PublicBroadcastPage } from './features/broadcast/pages/PublicBroadcastPage';
import { BroadcastProvider } from './features/broadcast/services/broadcast-context';
import { HomePage } from './features/home/pages/HomePage';
import { MediaExplorePage } from './features/media-explore/pages/MediaExplorePage';
import { HomePagePhone } from './features/home/pages/HomePagePhone';
import { MediaExplorePagePhone } from './features/media-explore/pages/MediaExplorePagePhone';
import { MediaLibraryPage } from './features/library/pages/MediaLibraryPage';
import { MediaLibraryPagePhone } from './features/library/pages/MediaLibraryPagePhone';
import { MediaDetailsPage } from './features/media-details/pages/MediaDetailsPage';
import { MediaDetailsPagePhone } from './features/media-details/pages/MediaDetailsPagePhone';
import { SettingsPage } from './features/settings/pages/SettingsPage';
import { SettingsPagePhone } from './features/settings/pages/SettingsPagePhone';
import { SystemSettingsPage } from './features/settings/pages/SystemSettingsPage';
import { SystemSettingsPagePhone } from './features/settings/pages/SystemSettingsPagePhone';
import { AccountAccessPage } from './features/settings/pages/AccountAccessPage';
import { AccountAccessPagePhone } from './features/settings/pages/AccountAccessPagePhone';
import { DownloadControlPage } from './features/settings/pages/DownloadControlPage';
import { DownloadControlPagePhone } from './features/settings/pages/DownloadControlPagePhone';
import { PlayerPage } from './features/player/pages/PlayerPage';
import { PlayerPagePhone } from './features/player/pages/PlayerPagePhone';

interface ExperienceRouteDefinition {
  path: string;
  desktop: ReactElement;
  phone: ReactElement;
}

interface GuardedExperienceRouteDefinition extends ExperienceRouteDefinition {
  allowed: boolean;
  redirectTo: string;
}

function routeElementForExperience(
  isPhoneExperience: boolean,
  route: ExperienceRouteDefinition,
): ReactElement {
  return isPhoneExperience ? route.phone : route.desktop;
}

function titleForPath(pathname: string): string {
  if (pathname === '/') {
    return 'Home - Yeen';
  }

  if (pathname.startsWith('/library')) {
    return 'Library - Yeen';
  }

  if (pathname.startsWith('/explore')) {
    return 'Explore - Yeen';
  }

  if (pathname.startsWith('/details/')) {
    return 'Media Details - Yeen';
  }

  if (pathname.startsWith('/player/')) {
    return 'Player - Yeen';
  }

  if (pathname.startsWith('/watch/')) {
    return 'Broadcast - Yeen';
  }

  if (pathname.startsWith('/settings')) {
    return 'Settings - Yeen';
  }

  if (pathname.startsWith('/admin/system')) {
    return 'System Settings - Yeen';
  }

  if (pathname.startsWith('/admin/accounts')) {
    return 'Accounts & Access - Yeen';
  }

  if (pathname.startsWith('/admin/download')) {
    return 'Download Control - Yeen';
  }

  return 'Yeen';
}

function inviteTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/invite\/([^/]+)$/i);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function watchTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/watch\/([^/]+)$/i);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function RouteTitleManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);

  return null;
}

function RouteScrollManager({ enabled }: { enabled: boolean }) {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (!enabled || hash || navigationType === 'POP') {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [enabled, hash, navigationType, pathname]);

  return null;
}

function PublicBroadcastRoute() {
  const { shareToken = '' } = useParams();
  return <PublicBroadcastPage shareToken={shareToken} />;
}

function App() {
  const experience = useClientExperience();
  const isTvExperience = experience === 'tv';
  const isNativePlatform = Capacitor.isNativePlatform();
  const shouldShowTvInstallPanel = isTvExperience && !isNativePlatform;
  const shouldShowNativeTvPairing = isNativePlatform;
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  });
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [usePasswordLoginOnTv, setUsePasswordLoginOnTv] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (shouldShowTvInstallPanel) {
        setBooting(false);
        return;
      }

      if (!token) {
        setBooting(false);
        return;
      }

      try {
        const profile = await me(token);
        if (!cancelled) {
          setUser(profile);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken('');
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [shouldShowTvInstallPanel, token]);

  function handleAuthenticated(response: AuthResponse) {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    setToken(response.accessToken);
    setUser(response.user);
    setUsePasswordLoginOnTv(false);
    setBooting(false);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setUser(null);
    setUsePasswordLoginOnTv(false);
    setBooting(false);
  }

  if (shouldShowTvInstallPanel) {
    return <TvInstallPanel />;
  }

  if (booting) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Yeen Streaming</p>
          <h1>Loading your session...</h1>
        </section>
      </main>
    );
  }

  if (!token || !user) {
    const watchToken = watchTokenFromPath(window.location.pathname);
    if (watchToken) {
      return <PublicBroadcastPage shareToken={watchToken} />;
    }

    const inviteToken = inviteTokenFromPath(window.location.pathname);
    if (inviteToken) {
      return (
        <InviteSignupPanel
          inviteToken={inviteToken}
          onAuthenticated={handleAuthenticated}
        />
      );
    }

    if (shouldShowNativeTvPairing && !usePasswordLoginOnTv) {
      return (
        <TvPairingAuthPanel
          onAuthenticated={handleAuthenticated}
          onUsePasswordLogin={() => {
            setUsePasswordLoginOnTv(true);
          }}
        />
      );
    }

    if (shouldShowNativeTvPairing) {
      return (
        <AuthPanel
          onAuthenticated={handleAuthenticated}
          secondaryActionLabel="Use TV code login instead"
          onSecondaryAction={() => {
            setUsePasswordLoginOnTv(false);
          }}
        />
      );
    }

    return <AuthPanel onAuthenticated={handleAuthenticated} />;
  }

  const isPhoneExperience = experience === 'phone';

  const commonPageProps = {
    token,
    user,
    onLogout: handleLogout,
  };

  const experienceRoutes: ExperienceRouteDefinition[] = [
    {
      path: '/',
      desktop: <HomePage {...commonPageProps} />,
      phone: <HomePagePhone {...commonPageProps} />,
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
    },
    {
      path: '/library',
      desktop: <MediaLibraryPage {...commonPageProps} />,
      phone: <MediaLibraryPagePhone {...commonPageProps} />,
    },
    {
      path: '/explore',
      desktop: <MediaExplorePage {...commonPageProps} />,
      phone: <MediaExplorePagePhone {...commonPageProps} />,
    },
    {
      path: '/details/:mediaId',
      desktop: <MediaDetailsPage {...commonPageProps} />,
      phone: <MediaDetailsPagePhone {...commonPageProps} />,
    },
    {
      path: '/player/:mediaId',
      desktop: <PlayerPage {...commonPageProps} />,
      phone: <PlayerPagePhone {...commonPageProps} />,
    },
  ];

  const guardedExperienceRoutes: GuardedExperienceRouteDefinition[] = [
    {
      path: '/admin/system',
      allowed: isAdminRole(user.role),
      redirectTo: '/settings',
      desktop: <SystemSettingsPage {...commonPageProps} />,
      phone: <SystemSettingsPagePhone {...commonPageProps} />,
    },
    {
      path: '/admin/accounts',
      allowed: isAdminRole(user.role),
      redirectTo: '/settings',
      desktop: <AccountAccessPage {...commonPageProps} />,
      phone: <AccountAccessPagePhone {...commonPageProps} />,
    },
    {
      path: '/admin/downloads',
      allowed: canAccessTorrentTools(user.role),
      redirectTo: '/',
      desktop: <DownloadControlPage {...commonPageProps} />,
      phone: <DownloadControlPagePhone {...commonPageProps} />,
    },
  ];

  return (
    <BrowserRouter>
      <BroadcastProvider token={token}>
        <RouteTitleManager />
        <RouteScrollManager enabled={!isPhoneExperience} />
        <Routes>
          <Route
            path="/watch/:shareToken"
            element={<PublicBroadcastRoute />}
          />

          {experienceRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={routeElementForExperience(isPhoneExperience, route)}
            />
          ))}

          {guardedExperienceRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={route.allowed
                ? routeElementForExperience(isPhoneExperience, route)
                : <Navigate to={route.redirectTo} replace />}
            />
          ))}

          <Route
            path="/admin/download-control"
            element={<Navigate to="/admin/downloads" replace />}
          />
          <Route
            path="/admin/metadata"
            element={<Navigate to="/admin/system#system-metadata-commits" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BroadcastProvider>
    </BrowserRouter>
  );
}

export default App;
