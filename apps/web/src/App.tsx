import {
  useEffect,
  lazy,
  Suspense,
  useLayoutEffect,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react';
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
import {
  buildExperienceRoutes,
  buildGuardedExperienceRoutes,
  routeElementForExperience,
} from './appRouteCatalog';
import { AuthPanel } from './features/auth/components/AuthPanel';
import { InviteSignupPanel } from './features/auth/components/InviteSignupPanel';
import { TvPairingAuthPanel } from './features/auth/components/TvPairingAuthPanel';
import { TvInstallPanel } from './features/auth/components/TvInstallPanel';
import {
  TOKEN_STORAGE_KEY,
  me,
  readStoredAccessToken,
  refreshSession,
} from './features/shared/services/api';
import {
  useClientExperience,
  type ClientExperience,
} from './features/navigation/services/clientExperience';
import { installAndroidBackNavigation } from './features/navigation/services/androidBackNavigation';
import { MediaModeProvider, useMediaMode } from './features/media-mode/services/MediaModeContext';
import { MediaModeSwitcher } from './features/media-mode/components/MediaModeSwitcher';
import {
  isMediaModeRoute,
  mediaModeForPath,
} from './features/media-mode/services/mediaModeRouting';
import {
  clearCachedAuthenticatedUser,
  readCachedAuthenticatedUser,
  shouldInvalidateAuthenticatedSession,
  writeCachedAuthenticatedUser,
} from './features/auth/services/authSessionRecovery';
import { createRollingSessionRefresher } from './features/auth/services/rollingAuthSession';
import { TvPageShell } from './features/navigation/components/TvPageShell';
import type { AuthResponse, User } from './features/shared/services/types';
import { PublicBroadcastPage } from './features/broadcast/pages/PublicBroadcastPage';
import { BroadcastProvider } from './features/broadcast/services/broadcast-context';
import { AppErrorBoundary } from './features/shared/components/AppErrorBoundary';
import { AddonHostProvider, useAddonHost } from './features/addons/runtime/AddonHostContext';
import { AddonRouteSurface } from './features/addons/runtime/AddonHostSlots';
import { AddonRouteFallback } from './features/addons/runtime/AddonRouteFallback';
import { canAccessAddonContribution } from './features/addons/runtime/addonRuntimeAccess';
import {
  applyTvDisplayPreferences,
  readTvDisplayPreferences,
} from './features/navigation/services/tvDisplayPreferences';
import {
  activateThemePreference,
  applyThemePreference,
} from './features/settings/services/themePreference';

const MusicExperiencePage = lazy(async () => {
  const module = await import('./features/music/pages/MusicExperiencePage');
  return { default: module.MusicExperiencePage };
});

function titleForPath(pathname: string): string {
  if (pathname === '/') {
    return 'Home - Yeen';
  }

  if (pathname.startsWith('/library')) {
    return 'Library - Yeen';
  }

  if (pathname.startsWith('/music')) {
    return 'Music - Yeen';
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

  if (pathname.startsWith('/admin/add-ons')) {
    return 'Add-ons - Yeen';
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

function resetTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/reset-password\/([^/]+)$/i);
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

function ModeAwareHomeRoute({ videoHome }: { videoHome: ReactElement }) {
  const { mode } = useMediaMode();
  return mode === 'music' ? <Navigate to="/music" replace /> : videoHome;
}

function MediaModeRouteSynchronizer() {
  const { pathname } = useLocation();
  const { mode, setMode } = useMediaMode();
  const routeMode = mediaModeForPath(pathname, mode);

  useLayoutEffect(() => {
    if (isMediaModeRoute(pathname) && routeMode !== mode) {
      setMode(routeMode);
    }
  }, [mode, pathname, routeMode, setMode]);

  return null;
}

function MusicModeRoute(props: {
  token: string;
  user: User;
  onLogout: () => void;
  experience: ClientExperience;
}) {
  const { experience, ...pageProps } = props;

  const page = (
    <Suspense fallback={<main className="music-route-loading">Opening your music library…</main>}>
      <MusicExperiencePage {...pageProps} />
    </Suspense>
  );
  return experience === 'tv'
    ? <TvPageShell pageKey="music">{page}</TvPageShell>
    : page;
}

interface AuthenticatedRouterProps {
  token: string;
  user: User;
  setUser: Dispatch<SetStateAction<User | null>>;
  onLogout: () => void;
  experience: ReturnType<typeof useClientExperience>;
}

function AuthenticatedRouter({
  token,
  user,
  setUser,
  onLogout,
  experience,
}: AuthenticatedRouterProps) {
  const { loading: addonsLoading, routes: addonRoutes } = useAddonHost();
  const isPhoneExperience = experience === 'phone';
  const commonPageProps = { token, user, onLogout };
  const experienceRoutes = buildExperienceRoutes(commonPageProps, setUser);
  const guardedExperienceRoutes = buildGuardedExperienceRoutes(
    commonPageProps,
    user,
  );

  return (
    <BrowserRouter>
      <MediaModeProvider accountId={user.id}>
        <BroadcastProvider token={token}>
          <RouteTitleManager />
          <RouteScrollManager enabled={!isPhoneExperience} />
          <MediaModeRouteSynchronizer />
          <MediaModeSwitcher />
          <Routes>
          <Route path="/watch/:shareToken" element={<PublicBroadcastRoute />} />
          <Route
            path="/music"
            element={
              <AppErrorBoundary>
                <MusicModeRoute {...commonPageProps} experience={experience} />
              </AppErrorBoundary>
            }
          />

          {addonRoutes.map((route) => (
            <Route
              key={`${route.addon.id}:${route.id}`}
              path={route.path}
              element={
                !canAccessAddonContribution(user.role, route)
                  ? <Navigate to="/" replace />
                  : (
                    <AppErrorBoundary>
                    <AddonRouteSurface route={route} />
                    </AppErrorBoundary>
                  )
              }
            />
          ))}

          {experienceRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                <AppErrorBoundary>
                  {route.path === '/'
                    ? (
                      <ModeAwareHomeRoute
                        videoHome={routeElementForExperience(experience, route)}
                      />
                    )
                    : routeElementForExperience(experience, route)}
                </AppErrorBoundary>
              }
            />
          ))}

          {guardedExperienceRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={
                route.allowed
                  ? (
                    <AppErrorBoundary>
                      {routeElementForExperience(experience, route)}
                    </AppErrorBoundary>
                  )
                  : <Navigate to={route.redirectTo} replace />
              }
            />
          ))}

          <Route path="/admin/download-control" element={<Navigate to="/admin/downloads" replace />} />
          <Route path="/admin/metadata" element={<Navigate to="/admin/system#system-metadata-commits" replace />} />
          <Route path="*" element={<AddonRouteFallback loading={addonsLoading} />} />
          </Routes>
        </BroadcastProvider>
      </MediaModeProvider>
    </BrowserRouter>
  );
}

function UnauthenticatedApp({
  onAuthenticated,
  isNativePlatform,
  shouldShowNativeTvPairing,
  usePasswordLoginOnTv,
  setUsePasswordLoginOnTv,
}: {
  onAuthenticated: (response: AuthResponse) => void;
  isNativePlatform: boolean;
  shouldShowNativeTvPairing: boolean;
  usePasswordLoginOnTv: boolean;
  setUsePasswordLoginOnTv: (value: boolean) => void;
}) {
  const watchToken = watchTokenFromPath(window.location.pathname);
  if (watchToken) return <PublicBroadcastPage shareToken={watchToken} />;
  const inviteToken = inviteTokenFromPath(window.location.pathname);
  if (inviteToken) return <InviteSignupPanel inviteToken={inviteToken} onAuthenticated={onAuthenticated} />;
  const resetToken = resetTokenFromPath(window.location.pathname);
  if (resetToken) {
    return <AuthPanel onAuthenticated={onAuthenticated} initialResetToken={resetToken}
      showServerConfiguration={isNativePlatform} />;
  }
  if (shouldShowNativeTvPairing && !usePasswordLoginOnTv) {
    return (
      <BrowserRouter>
        <TvPairingAuthPanel
          onAuthenticated={onAuthenticated}
          onUsePasswordLogin={() => setUsePasswordLoginOnTv(true)}
        />
      </BrowserRouter>
    );
  }
  if (shouldShowNativeTvPairing) {
    return (
      <BrowserRouter>
        <TvPageShell pageKey="tv-password-login">
          <AuthPanel
            onAuthenticated={onAuthenticated}
            showServerConfiguration={isNativePlatform}
            secondaryActionLabel="Use TV code login instead"
            onSecondaryAction={() => setUsePasswordLoginOnTv(false)}
          />
        </TvPageShell>
      </BrowserRouter>
    );
  }
  return <AuthPanel onAuthenticated={onAuthenticated} showServerConfiguration={isNativePlatform} />;
}

function App() {
  const experience = useClientExperience();
  const isTvExperience = experience === 'tv';
  const isNativePlatform = Capacitor.isNativePlatform();
  const nativePlatform = isNativePlatform ? Capacitor.getPlatform() : null;
  const shouldShowTvInstallPanel = isTvExperience && !isNativePlatform;
  const shouldShowNativeTvPairing = isNativePlatform && isTvExperience;
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  });
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [usePasswordLoginOnTv, setUsePasswordLoginOnTv] = useState(false);
  const [sessionCheckUnavailable, setSessionCheckUnavailable] = useState(false);
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-yeen-experience', experience);
    document.body.setAttribute('data-yeen-experience', experience);
    if (nativePlatform) {
      document.documentElement.setAttribute('data-yeen-native-platform', nativePlatform);
      document.body.setAttribute('data-yeen-native-platform', nativePlatform);
    } else {
      document.documentElement.removeAttribute('data-yeen-native-platform');
      document.body.removeAttribute('data-yeen-native-platform');
    }
    applyTvDisplayPreferences(readTvDisplayPreferences());
  }, [experience, nativePlatform]);

  useEffect(() => {
    if (!isNativePlatform) {
      return;
    }

    return installAndroidBackNavigation(window, document);
  }, [isNativePlatform]);

  useEffect(() => {
    if (!user?.id) {
      applyThemePreference('current');
      return;
    }

    return activateThemePreference(user.id);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (shouldShowTvInstallPanel) {
        setBooting(false);
        return;
      }

      if (!token) {
        setSessionCheckUnavailable(false);
        setBooting(false);
        return;
      }

      try {
        const profile = await me(token);
        if (!cancelled) {
          setUser(profile);
          writeCachedAuthenticatedUser(profile);
          setSessionCheckUnavailable(false);
        }
      } catch (error) {
        if (!cancelled) {
          if (shouldInvalidateAuthenticatedSession(error)) {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            clearCachedAuthenticatedUser();
            setToken('');
            setUser(null);
            setSessionCheckUnavailable(false);
          } else {
            const cachedUser = readCachedAuthenticatedUser();
            setUser(cachedUser);
            setSessionCheckUnavailable(!cachedUser);
          }
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
  }, [sessionCheckAttempt, shouldShowTvInstallPanel, token]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const refresher = createRollingSessionRefresher({
      getToken: () => readStoredAccessToken() || token,
      refresh: refreshSession,
      onRefreshed: (response) => {
        localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
        writeCachedAuthenticatedUser(response.user);
        setToken(response.accessToken);
        setUser(response.user);
      },
    });
    const refreshForActivity = () => {
      void refresher.refreshIfNeeded();
    };
    const refreshForPlayback = (event: Event) => {
      const media = event.target;
      if (
        media instanceof HTMLMediaElement
        && !media.paused
        && !media.ended
        && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        refreshForActivity();
      }
    };
    const refreshWhilePlaying = () => {
      const hasActivePlayback = [...document.querySelectorAll('video, audio')]
        .some((element) => element instanceof HTMLMediaElement
          && !element.paused && !element.ended);
      if (hasActivePlayback) {
        refreshForActivity();
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshForActivity();
      }
    };

    document.addEventListener('playing', refreshForPlayback, true);
    document.addEventListener('timeupdate', refreshForPlayback, true);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('keydown', refreshForActivity);
    window.addEventListener('pointerdown', refreshForActivity);
    const playbackInterval = window.setInterval(refreshWhilePlaying, 5 * 60 * 1000);

    refreshWhenVisible();

    return () => {
      document.removeEventListener('playing', refreshForPlayback, true);
      document.removeEventListener('timeupdate', refreshForPlayback, true);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('keydown', refreshForActivity);
      window.removeEventListener('pointerdown', refreshForActivity);
      window.clearInterval(playbackInterval);
    };
  }, [token, user]);

  function handleAuthenticated(response: AuthResponse) {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    writeCachedAuthenticatedUser(response.user);
    setToken(response.accessToken);
    setUser(response.user);
    setSessionCheckUnavailable(false);
    setUsePasswordLoginOnTv(false);
    setBooting(false);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    clearCachedAuthenticatedUser();
    setToken('');
    setUser(null);
    setSessionCheckUnavailable(false);
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

  if (token && !user && sessionCheckUnavailable) {
    return (
      <main className="auth-page">
        <section className="auth-panel" role="status" aria-live="polite">
          <p className="eyebrow">Session preserved</p>
          <h1>Yeen cannot reach your server.</h1>
          <p>
            Your sign-in is still saved. Reconnect to the network or start the Yeen server,
            then try again.
          </p>
          <button
            type="button"
            onClick={() => {
              setBooting(true);
              setSessionCheckUnavailable(false);
              setSessionCheckAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!token || !user) {
    return <UnauthenticatedApp onAuthenticated={handleAuthenticated}
      isNativePlatform={isNativePlatform} shouldShowNativeTvPairing={shouldShowNativeTvPairing}
      usePasswordLoginOnTv={usePasswordLoginOnTv} setUsePasswordLoginOnTv={setUsePasswordLoginOnTv} />;
  }

  return (
    <AddonHostProvider
      token={token}
      user={user}
      clientExperience={experience}
      onLogout={handleLogout}
    >
      <AuthenticatedRouter
        token={token}
        user={user}
        setUser={setUser}
        onLogout={handleLogout}
        experience={experience}
      />
    </AddonHostProvider>
  );
}

export default App;
