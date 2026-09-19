# Yeen web client

The React client is an installable Progressive Web App on supported mobile and
desktop browsers. Its generated manifest and service worker are built by
`vite-plugin-pwa` and verified at the end of every production build.

## Install it

Serve Yeen over HTTPS (or `localhost` while developing), sign in, then use the
browser's install action:

- Chrome and Edge on desktop: select **Install Yeen** in the address bar or
  browser menu.
- Android browsers: select **Install app** or **Add to Home screen**.
- Safari on iPhone or iPad: open the Share menu, select **Add to Home Screen**,
  and enable **Open as Web App** when offered.

The installed app launches in its own window and keeps the current server URL,
account, theme, and media-mode preferences stored by the web client.

## Offline and updates

The service worker caches only the versioned application shell: HTML,
JavaScript, CSS, fonts, and Yeen-owned icons. API responses, streams, subtitles,
and personal media are network-only and are never copied into the PWA cache.
Cached screens can launch without a connection, while playback and library
updates resume when the server is reachable again.

An available client update is shown inside Yeen with a deliberate **Reload**
action so an update cannot silently interrupt playback. Returning to the app or
regaining connectivity also checks for a new version.

The Capacitor Android application uses the same web build but does not register
the browser service worker. APK assets remain controlled exclusively by the APK
version, avoiding stale web assets inside the native WebView.

## Development

```sh
npm run dev
npm run build
npm run pwa:audit
npm run preview
```

Service workers are intentionally enabled only in production builds. Use
`npm run build && npm run preview` to exercise installation and offline startup.
