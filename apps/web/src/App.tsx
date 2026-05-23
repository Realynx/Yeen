import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthPanel } from './components/AuthPanel';
import { InviteSignupPanel } from './components/InviteSignupPanel';
import { TOKEN_STORAGE_KEY, me } from './lib/api';
import { useClientExperience } from './lib/ui/clientExperience';
import type { AuthResponse, User } from './lib/types';
import { canAccessTorrentTools, isAdminRole } from './lib/roles';
import { HomePage } from './pages/HomePage';
import { MediaExplorePage } from './pages/MediaExplorePage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { MediaDetailsPage } from './pages/MediaDetailsPage';
import { PlayerPage } from './pages/PlayerPage';
import { DownloadControlPage } from './pages/DownloadControlPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { AccountAccessPage } from './pages/AccountAccessPage';
import { HomePagePhone } from './pages/phone/HomePagePhone';
import { MediaExplorePagePhone } from './pages/phone/MediaExplorePagePhone';
import { MediaLibraryPagePhone } from './pages/phone/MediaLibraryPagePhone';
import { MediaDetailsPagePhone } from './pages/phone/MediaDetailsPagePhone';
import { PlayerPagePhone } from './pages/phone/PlayerPagePhone';
import { DownloadControlPagePhone } from './pages/phone/DownloadControlPagePhone';
import { SettingsPagePhone } from './pages/phone/SettingsPagePhone';
import { SystemSettingsPagePhone } from './pages/phone/SystemSettingsPagePhone';
import { AccountAccessPagePhone } from './pages/phone/AccountAccessPagePhone';

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

function RouteTitleManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);

  return null;
}

function App() {
  const experience = useClientExperience();
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  });
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
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
  }, [token]);

  function handleAuthenticated(response: AuthResponse) {
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    setToken(response.accessToken);
    setUser(response.user);
    setBooting(false);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setUser(null);
    setBooting(false);
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
    const inviteToken = inviteTokenFromPath(window.location.pathname);
    if (inviteToken) {
      return (
        <InviteSignupPanel
          inviteToken={inviteToken}
          onAuthenticated={handleAuthenticated}
        />
      );
    }

    return <AuthPanel onAuthenticated={handleAuthenticated} />;
  }

  const isPhoneExperience = experience === 'phone';

  return (
    <BrowserRouter>
      <RouteTitleManager />
      <Routes>
        <Route
          path="/"
          element={
            isPhoneExperience ? (
              <HomePagePhone token={token} user={user} onLogout={handleLogout} />
            ) : (
              <HomePage token={token} user={user} onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/settings"
          element={
            isPhoneExperience ? (
              <SettingsPagePhone
                token={token}
                user={user}
                onUserUpdated={setUser}
                onLogout={handleLogout}
              />
            ) : (
              <SettingsPage
                token={token}
                user={user}
                onUserUpdated={setUser}
                onLogout={handleLogout}
              />
            )
          }
        />
        <Route
          path="/library"
          element={
            isPhoneExperience ? (
              <MediaLibraryPagePhone token={token} user={user} onLogout={handleLogout} />
            ) : (
              <MediaLibraryPage token={token} user={user} onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/explore"
          element={
            isPhoneExperience ? (
              <MediaExplorePagePhone token={token} user={user} onLogout={handleLogout} />
            ) : (
              <MediaExplorePage token={token} user={user} onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/details/:mediaId"
          element={
            isPhoneExperience ? (
              <MediaDetailsPagePhone token={token} user={user} onLogout={handleLogout} />
            ) : (
              <MediaDetailsPage token={token} user={user} onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/player/:mediaId"
          element={
            isPhoneExperience ? (
              <PlayerPagePhone token={token} user={user} onLogout={handleLogout} />
            ) : (
              <PlayerPage token={token} user={user} onLogout={handleLogout} />
            )
          }
        />
        <Route
          path="/admin/system"
          element={
            isAdminRole(user.role) ? (
              isPhoneExperience ? (
                <SystemSettingsPagePhone token={token} user={user} onLogout={handleLogout} />
              ) : (
                <SystemSettingsPage token={token} user={user} onLogout={handleLogout} />
              )
            ) : (
              <Navigate to="/settings" replace />
            )
          }
        />
        <Route
          path="/admin/accounts"
          element={
            isAdminRole(user.role) ? (
              isPhoneExperience ? (
                <AccountAccessPagePhone token={token} user={user} onLogout={handleLogout} />
              ) : (
                <AccountAccessPage token={token} user={user} onLogout={handleLogout} />
              )
            ) : (
              <Navigate to="/settings" replace />
            )
          }
        />
        <Route
          path="/admin/downloads"
          element={
            canAccessTorrentTools(user.role) ? (
              isPhoneExperience ? (
                <DownloadControlPagePhone token={token} user={user} onLogout={handleLogout} />
              ) : (
                <DownloadControlPage token={token} user={user} onLogout={handleLogout} />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin/download-control"
          element={<Navigate to="/admin/downloads" replace />}
        />
        <Route
          path="/admin/metadata"
          element={<Navigate to="/admin/system#system-metadata" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
