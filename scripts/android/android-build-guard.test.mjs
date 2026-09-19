import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReleaseSigningEnvironment,
  auditAndroidSources,
  findBuiltApk,
} from './android-build-guard.mjs';

const compliantConfig = {
  appId: 'com.yeen.client',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: true },
};
const compliantManifest = `
  <application android:allowBackup="false" android:usesCleartextTraffic="true"
    android:enableOnBackInvokedCallback="true"
    android:banner="@drawable/yeen_tv_banner" />
  <uses-permission android:name="android.permission.INTERNET" />
`;
const compliantGradle = 'rootPackageVersion releaseSigningAvailable';
const compliantActivity = `
  setAppendedUserAgentString("YeenTV/1.0 Android TV");
  super.onCreate(savedInstanceState);
  window.__yeenHandleAndroidBack;
`;
const compliantColors = `
  <color name="colorPrimaryDark">#080A0F</color>
  <color name="splashBackground">#080A0F</color>
`;
const compliantSplash = '<vector android:width="108dp" android:height="108dp" />';
const compliantBanner = `
  <vector android:width="160dp" android:height="90dp"
    android:viewportWidth="320" android:viewportHeight="180" />
`;
const compliantStyles = `
  <item name="windowSplashScreenBackground">@color/splashBackground</item>
  <item name="windowSplashScreenAnimatedIcon">@drawable/yeen_splash_mark</item>
  <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
`;

test('audit identifies the unsafe legacy APK configuration', () => {
  const issues = auditAndroidSources({
    capacitorConfig: { ...compliantConfig, android: undefined },
    manifestXml: '<application android:allowBackup="true" />',
    appBuildGradle: 'versionName "1.0"',
    packageVersion: '1.0.0',
  });

  assert.ok(issues.length >= 8);
  assert.match(issues.join('\n'), /mixed content/);
  assert.match(issues.join('\n'), /cleartext LAN traffic/);
  assert.match(issues.join('\n'), /access tokens/);
  assert.match(issues.join('\n'), /root package version/);
  assert.match(issues.join('\n'), /release signing/);
});

test('audit accepts the hardened APK configuration', () => {
  assert.deepEqual(auditAndroidSources({
    capacitorConfig: compliantConfig,
    manifestXml: compliantManifest,
    appBuildGradle: compliantGradle,
    mainActivityJava: compliantActivity,
    colorsXml: compliantColors,
    splashMarkXml: compliantSplash,
    tvBannerXml: compliantBanner,
    stylesXml: compliantStyles,
    packageVersion: '2.4.1-beta.2',
  }), []);
});

test('audit rejects the stock splash and square TV banner regression', () => {
  const issues = auditAndroidSources({
    capacitorConfig: compliantConfig,
    manifestXml: compliantManifest.replace('yeen_tv_banner', 'tv_banner'),
    appBuildGradle: compliantGradle,
    mainActivityJava: compliantActivity,
    colorsXml: compliantColors,
    splashMarkXml: '<bitmap android:src="@drawable/splash" />',
    tvBannerXml: `
      <vector android:width="512dp" android:height="512dp"
        android:viewportWidth="512" android:viewportHeight="512" />
    `,
    stylesXml: '<item name="android:background">@drawable/splash</item>',
    packageVersion: '2.4.1',
  });

  assert.match(issues.join('\n'), /landscape Yeen TV banner/);
  assert.match(issues.join('\n'), /Launch theme must wire/);
  assert.match(issues.join('\n'), /108dp square vector/);
  assert.match(issues.join('\n'), /landscape 16:9 vector/);
});

test('audit rejects Android TV detection after the Capacitor WebView starts', () => {
  const issues = auditAndroidSources({
    capacitorConfig: compliantConfig,
    manifestXml: compliantManifest,
    appBuildGradle: compliantGradle,
    mainActivityJava: `
      window.__yeenHandleAndroidBack;
      super.onCreate(savedInstanceState);
      setAppendedUserAgentString("YeenTV/1.0 Android TV");
    `,
    colorsXml: compliantColors,
    splashMarkXml: compliantSplash,
    tvBannerXml: compliantBanner,
    stylesXml: compliantStyles,
    packageVersion: '2.4.1',
  });

  assert.match(issues.join('\n'), /before Capacitor starts loading/);
});

test('release signing requires every credential and a readable keystore', async () => {
  await assert.rejects(
    assertReleaseSigningEnvironment({}, async () => {}),
    /YEEN_ANDROID_KEYSTORE_PATH.*YEEN_ANDROID_KEY_PASSWORD/,
  );

  await assert.rejects(
    assertReleaseSigningEnvironment({
      YEEN_ANDROID_KEYSTORE_PATH: 'C:/missing.jks',
      YEEN_ANDROID_KEYSTORE_PASSWORD: 'store-secret',
      YEEN_ANDROID_KEY_ALIAS: 'yeen',
      YEEN_ANDROID_KEY_PASSWORD: 'key-secret',
    }, async () => {
      throw new Error('missing');
    }),
    /does not exist or is unreadable/,
  );
});

test('APK publication never falls back between debug and release outputs', async () => {
  const seen = [];
  const debugPath = await findBuiltApk('C:/repo', 'debug', async (candidate) => {
    seen.push(candidate);
  });

  assert.match(debugPath, /debug[\\/]app-debug\.apk$/);
  assert.equal(seen.length, 1);

  await assert.rejects(
    findBuiltApk('C:/repo', 'release', async (candidate) => {
      assert.match(candidate, /release[\\/]app-release\.apk$/);
      throw new Error('only unsigned output exists');
    }),
    /signed release APK/,
  );
});
