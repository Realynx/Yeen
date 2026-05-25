import { useEffect } from 'react';
import { absoluteApiUrl } from '../../shared/services/api';
import './TvInstallPanel.css';

const TV_APK_DOWNLOAD_URL_ENV =
  (import.meta.env.VITE_TV_APK_DOWNLOAD_URL as string | undefined)?.trim() ?? '';

function resolveTvApkDownloadUrl() {
  if (TV_APK_DOWNLOAD_URL_ENV) {
    return TV_APK_DOWNLOAD_URL_ENV;
  }

  return absoluteApiUrl('/install/android-tv-apk');
}

export function TvInstallPanel() {
  const apkDownloadUrl = resolveTvApkDownloadUrl();

  useEffect(() => {
    document.title = 'Install Yeen TV App';
  }, []);

  return (
    <main className="auth-page tv-install-page">
      <section className="auth-panel tv-install-panel">
        <p className="eyebrow">Yeen for TV</p>
        <h1>Install the APK to continue</h1>
        <p className="subline">
          TV browsers are limited for playback and remote navigation. Install the
          Android TV app for the best experience, then sign in inside the app.
        </p>

        <div className="tv-install-actions">
          <a className="tv-install-download-button" href={apkDownloadUrl}>
            Download Yeen TV APK
          </a>
        </div>

        <ol className="tv-install-steps">
          <li>Enable app installs from unknown sources in your TV or Firestick settings.</li>
          <li>Download and open the APK from your TV browser downloads screen.</li>
          <li>Install Yeen TV, then launch it and sign in.</li>
        </ol>

        <p className="tv-install-support-note">
          If this download link is unavailable, ask your server admin to configure
          TV_APK_FILE_PATH on the server.
        </p>
      </section>
    </main>
  );
}
