# Android clients

The web app now includes a Capacitor Android wrapper at apps/web/android.

Use these root-level commands:

```bash
npm run android:add
npm run android:configure-sdk
npm run android:sync
npm run android:open
npm run android:build:debug
npm run android:build:release
```

Run `npm run android:test` and `npm run android:audit` before opening Android
Studio. The tagged release workflow also runs these checks, Gradle unit tests,
Android Lint, and a debug APK build.

Google TV emulator workflow (development):

1. Start a Google TV emulator from Android Studio Device Manager.
2. List connected targets and confirm a TV emulator is detected:

```bash
npm run android:tv:list
```

3. Install and launch the latest debug APK on the emulator:

```bash
npm run android:tv:apk
```

4. For live iteration without rebuilding APK each change:

Terminal 1 (web dev server):

```bash
npm run dev:web:tv
```

Terminal 2 (deploy Capacitor app in live-reload mode):

```bash
npm run android:tv:live
```

Optional target override (if multiple emulators/devices are connected):

```bash
npm --prefix apps/web run android:tv:apk -- --serial emulator-5554
npm --prefix apps/web run android:tv:live -- --serial emulator-5554
```

Notes for live-reload mode:

- Default host is `10.0.2.2` with port `5173`, which maps emulator -> host machine.
- `android:tv:live` uses `--no-sync` for faster loops. Re-run `npm run android:sync` after native/plugin changes.

Notes:

- android:configure-sdk auto-detects Android SDK and writes
  apps/web/android/local.properties.
- android:build:release refuses to build an unsigned APK. Configure the four
  signing variables below with the same long-lived key for every release.
- android:build:debug publishes the built APK to artifacts/tv/yeen-tv.apk.
- android:build:release publishes release APK output to artifacts/tv/yeen-tv.apk.
- Packaged Android phone and TV clients support explicitly configured HTTP home-server
  URLs. On first sign-in, set **Yeen Server** to the reachable LAN or HTTPS API URL
  (for example `http://192.168.1.25:4000/api`); `localhost` refers to the Android
  device itself.
  HTTP exposes credentials and playback traffic on the network, so use HTTPS
  whenever possible.
- TV browsers are auto-gated to an install page when detected as `tv` UI.
- The install page downloads from `/api/install/android-tv-apk` by default.
  By default this serves artifacts/tv/yeen-tv.apk (latest published build).
  Configure `TV_APK_FILE_PATH` in `apps/server/.env` to override.
- Optional frontend override: `VITE_TV_APK_DOWNLOAD_URL` in `apps/web/.env`.

Signed release variables:

```bash
export YEEN_ANDROID_KEYSTORE_PATH=/absolute/path/to/yeen-release.jks
export YEEN_ANDROID_KEYSTORE_PASSWORD='...'
export YEEN_ANDROID_KEY_ALIAS='yeen'
export YEEN_ANDROID_KEY_PASSWORD='...'
npm run android:build:release
```

GitHub Actions uses the corresponding repository secrets and expects the
keystore itself in `YEEN_ANDROID_KEYSTORE_BASE64`. When all four secrets are
present, a checksummed signed APK is attached to the GitHub Release. The CI
debug APK remains a workflow artifact and is deliberately not published as a
release download because its disposable debug signature cannot support safe
in-place upgrades.

