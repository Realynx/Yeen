import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const RELEASE_SIGNING_KEYS = [
  'YEEN_ANDROID_KEYSTORE_PATH',
  'YEEN_ANDROID_KEYSTORE_PASSWORD',
  'YEEN_ANDROID_KEY_ALIAS',
  'YEEN_ANDROID_KEY_PASSWORD',
];

function numericAndroidAttribute(xml, name, suffix = '') {
  const match = new RegExp(`android:${name}=["']([0-9]+(?:\\.[0-9]+)?)${suffix}["']`).exec(xml);
  return match ? Number(match[1]) : null;
}

function hasAspectRatio(width, height, expected, tolerance = 0.01) {
  return width !== null
    && height !== null
    && height > 0
    && Math.abs((width / height) - expected) <= tolerance;
}

function auditCapacitorConfig(config, issues) {
  const checks = [
    [config.appId === 'com.yeen.client', 'Capacitor appId must remain com.yeen.client.'],
    [config.webDir === 'dist', 'Capacitor webDir must point to the Vite dist directory.'],
    [config.server?.androidScheme === 'https', 'The packaged WebView origin must use the secure https scheme.'],
    [config.android?.allowMixedContent === true, 'Android must allow mixed content so a secure packaged WebView can reach an explicitly configured HTTP home server.'],
  ];
  for (const [valid, message] of checks) {
    if (!valid) issues.push(message);
  }
}

function auditManifest(manifestXml, issues) {
  const checks = [
    [/android:usesCleartextTraffic=["']true["']/, 'AndroidManifest must opt into cleartext LAN traffic for self-hosted HTTP servers.'],
    [/android\.permission\.INTERNET/, 'AndroidManifest is missing the INTERNET permission.'],
    [/android:allowBackup=["']false["']/, 'Android backups must be disabled because the WebView stores account access tokens.'],
    [/android:enableOnBackInvokedCallback=["']true["']/, 'AndroidManifest must enable the modern system back callback.'],
    [/android:banner=["']@drawable\/yeen_tv_banner["']/, 'AndroidManifest must use the landscape Yeen TV banner resource.'],
  ];
  for (const [pattern, message] of checks) {
    if (!pattern.test(manifestXml)) issues.push(message);
  }
}

function auditNativeBuild(appBuildGradle, mainActivityJava, issues) {
  if (!/rootPackageVersion/.test(appBuildGradle)) {
    issues.push('Gradle must derive versionName/versionCode from the root package version.');
  }
  if (!/releaseSigningAvailable/.test(appBuildGradle)) {
    issues.push('Gradle is missing the environment-backed release signing configuration.');
  }
  if (!/__yeenHandleAndroidBack/.test(mainActivityJava)) {
    issues.push('MainActivity must delegate Android system back to the web navigation hook.');
  }
  const tvUserAgentIndex = mainActivityJava.indexOf('setAppendedUserAgentString');
  const bridgeStartIndex = mainActivityJava.indexOf('super.onCreate');
  if (
    tvUserAgentIndex < 0
    || bridgeStartIndex < 0
    || tvUserAgentIndex > bridgeStartIndex
  ) {
    issues.push('MainActivity must identify Android TV before Capacitor starts loading the WebView.');
  }
}

function auditSplash(stylesXml, splashMarkXml, issues) {
  const themeConfigured = [
    /windowSplashScreenBackground[^<]*@color\/splashBackground/,
    /windowSplashScreenAnimatedIcon[^<]*@drawable\/yeen_splash_mark/,
    /postSplashScreenTheme[^<]*@style\/AppTheme\.NoActionBar/,
  ].every((pattern) => pattern.test(stylesXml));
  if (!themeConfigured) {
    issues.push('Launch theme must wire the Yeen splash background, mark, and post-splash theme.');
  }

  const markConfigured = [
    /<vector\b/,
    /android:width=["']108dp["']/,
    /android:height=["']108dp["']/,
  ].every((pattern) => pattern.test(splashMarkXml));
  if (!markConfigured) {
    issues.push('Splash mark must remain a 108dp square vector drawable.');
  }
}

function auditTvBanner(tvBannerXml, issues) {
  const width = numericAndroidAttribute(tvBannerXml, 'width', 'dp');
  const height = numericAndroidAttribute(tvBannerXml, 'height', 'dp');
  const viewportWidth = numericAndroidAttribute(tvBannerXml, 'viewportWidth');
  const viewportHeight = numericAndroidAttribute(tvBannerXml, 'viewportHeight');
  if (
    !/<vector\b/.test(tvBannerXml)
    || !hasAspectRatio(width, height, 16 / 9)
    || !hasAspectRatio(viewportWidth, viewportHeight, 16 / 9)
  ) {
    issues.push('TV banner must remain a landscape 16:9 vector drawable.');
  }
}

function auditColorsAndVersion(colorsXml, packageVersion, issues) {
  if (
    !/<color\s+name=["']colorPrimaryDark["']>/.test(colorsXml)
    || !/<color\s+name=["']splashBackground["']>/.test(colorsXml)
  ) {
    issues.push('Native colors must define the dark system-bar and splash backgrounds.');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
    issues.push(`Root package version is not an Android-compatible semantic version: ${packageVersion}`);
  }
}

export function auditAndroidSources({
  capacitorConfig,
  manifestXml,
  appBuildGradle,
  mainActivityJava = '',
  colorsXml = '',
  splashMarkXml = '',
  tvBannerXml = '',
  stylesXml = '',
  packageVersion,
}) {
  const issues = [];
  const config = typeof capacitorConfig === 'string'
    ? JSON.parse(capacitorConfig)
    : capacitorConfig;

  auditCapacitorConfig(config, issues);
  auditManifest(manifestXml, issues);
  auditNativeBuild(appBuildGradle, mainActivityJava, issues);
  auditSplash(stylesXml, splashMarkXml, issues);
  auditTvBanner(tvBannerXml, issues);
  auditColorsAndVersion(colorsXml, packageVersion, issues);

  return issues;
}

export async function assertReleaseSigningEnvironment(
  environment = process.env,
  canAccess = access,
) {
  const missing = RELEASE_SIGNING_KEYS.filter((key) => !environment[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Signed Android release requires: ${missing.join(', ')}. `
      + 'Use android:build:debug for a locally installable development APK.',
    );
  }

  if (!path.isAbsolute(environment.YEEN_ANDROID_KEYSTORE_PATH)) {
    throw new Error('YEEN_ANDROID_KEYSTORE_PATH must be an absolute path.');
  }
  const keystorePath = path.resolve(environment.YEEN_ANDROID_KEYSTORE_PATH);
  try {
    await canAccess(keystorePath);
  } catch {
    throw new Error(`Android release keystore does not exist or is unreadable: ${keystorePath}`);
  }

  return {
    keystorePath,
    keystorePassword: environment.YEEN_ANDROID_KEYSTORE_PASSWORD,
    keyAlias: environment.YEEN_ANDROID_KEY_ALIAS,
    keyPassword: environment.YEEN_ANDROID_KEY_PASSWORD,
  };
}

export async function findBuiltApk(repoRoot, mode, canAccess = access) {
  const fileName = mode === 'release' ? 'app-release.apk' : 'app-debug.apk';
  const apkPath = path.join(
    repoRoot,
    'apps',
    'web',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    mode,
    fileName,
  );

  try {
    await canAccess(apkPath);
    return apkPath;
  } catch {
    const qualification = mode === 'release' ? 'signed release' : 'debug';
    throw new Error(`Unable to find ${qualification} APK at ${apkPath}.`);
  }
}

export async function auditAndroidProject(repoRoot) {
  const resourceRoot = path.join(
    repoRoot, 'apps', 'web', 'android', 'app', 'src', 'main', 'res',
  );
  const [
    capacitorConfig,
    manifestXml,
    appBuildGradle,
    mainActivityJava,
    colorsXml,
    splashMarkXml,
    tvBannerXml,
    stylesXml,
    packageJson,
  ] = await Promise.all([
    readFile(path.join(repoRoot, 'apps', 'web', 'capacitor.config.json'), 'utf8'),
    readFile(
      path.join(repoRoot, 'apps', 'web', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      'utf8',
    ),
    readFile(path.join(repoRoot, 'apps', 'web', 'android', 'app', 'build.gradle'), 'utf8'),
    readFile(
      path.join(
        repoRoot,
        'apps',
        'web',
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'yeen',
        'client',
        'MainActivity.java',
      ),
      'utf8',
    ),
    readFile(path.join(resourceRoot, 'values', 'colors.xml'), 'utf8'),
    readFile(path.join(resourceRoot, 'drawable', 'yeen_splash_mark.xml'), 'utf8'),
    readFile(path.join(resourceRoot, 'drawable', 'yeen_tv_banner.xml'), 'utf8'),
    readFile(path.join(resourceRoot, 'values', 'styles.xml'), 'utf8'),
    readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  ]);

  return auditAndroidSources({
    capacitorConfig,
    manifestXml,
    appBuildGradle,
    mainActivityJava,
    colorsXml,
    splashMarkXml,
    tvBannerXml,
    stylesXml,
    packageVersion: JSON.parse(packageJson).version,
  });
}
