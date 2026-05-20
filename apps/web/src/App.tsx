import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPanel } from './components/AuthPanel';
import { TOKEN_STORAGE_KEY, me } from './lib/api';
import type { AuthResponse, User } from './lib/types';
import { HomePage } from './pages/HomePage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { MediaDetailsPage } from './pages/MediaDetailsPage';
import { PlayerPage } from './pages/PlayerPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
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
    return <AuthPanel onAuthenticated={handleAuthenticated} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<HomePage token={token} user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/settings"
          element={<SettingsPage token={token} user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/library"
          element={<MediaLibraryPage token={token} user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/details/:mediaId"
          element={<MediaDetailsPage token={token} user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/player/:mediaId"
          element={<PlayerPage token={token} user={user} onLogout={handleLogout} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
