#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_ID = 'com.yeen.client';
const APP_ACTIVITY = '.MainActivity';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const adbExecutable = resolveAdbExecutable();
const npmRuntime = resolveNpmRuntime();
const capRuntime = resolveCapRuntime();
const debugApkPath = path.resolve(
  webRoot,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
);

function resolveNpmRuntime() {
  const npmCli = process.env.npm_execpath?.trim() ?? '';
  if (npmCli) {
    return {
      npmCommand: process.execPath,
      npmBaseArgs: [npmCli],
      canUseNpmExec: true,
    };
  }

  return {
    npmCommand: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    npmBaseArgs: [],
    canUseNpmExec: false,
  };
}

function resolveCapRuntime() {
  const localCapCli = path.resolve(webRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  if (existsSync(localCapCli)) {
    return {
      command: process.execPath,
      baseArgs: [localCapCli],
    };
  }

  const capBinary = process.platform === 'win32' ? 'cap.cmd' : 'cap';
  const localCapBinary = path.resolve(webRoot, 'node_modules', '.bin', capBinary);
  if (existsSync(localCapBinary)) {
    return {
      command: localCapBinary,
      baseArgs: [],
    };
  }

  return null;
}

function decodeJavaPropertiesValue(value) {
  return value
    .replace(/\\:/g, ':')
    .replace(/\\=/g, '=')
    .replace(/\\\\/g, '\\');
}

function readSdkDirFromLocalProperties() {
  const localPropertiesPath = path.resolve(webRoot, 'android', 'local.properties');
  if (!existsSync(localPropertiesPath)) {
    return '';
  }

  const contents = readFileSync(localPropertiesPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith('sdk.dir=')) {
      continue;
    }

    const rawValue = trimmed.slice('sdk.dir='.length).trim();
    if (!rawValue) {
      continue;
    }

    return decodeJavaPropertiesValue(rawValue);
  }

  return '';
}

function resolveAdbExecutable() {
  const binaryName = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [];

  const sdkDirFromEnv = process.env.ANDROID_SDK_ROOT?.trim() || process.env.ANDROID_HOME?.trim() || '';
  if (sdkDirFromEnv) {
    candidates.push(path.resolve(sdkDirFromEnv, 'platform-tools', binaryName));
  }

  const sdkDirFromLocalProperties = readSdkDirFromLocalProperties();
  if (sdkDirFromLocalProperties) {
    candidates.push(path.resolve(sdkDirFromLocalProperties, 'platform-tools', binaryName));
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'adb';
}

function printUsage() {
  console.log('Google TV emulator runner for Yeen (apps/web)');
  console.log('');
  console.log('Usage:');
  console.log('  node ./scripts/run-google-tv-emulator.mjs --list');
  console.log('  node ./scripts/run-google-tv-emulator.mjs --mode apk [--serial emulator-5554]');
  console.log('  node ./scripts/run-google-tv-emulator.mjs --mode apk emulator-5554');
  console.log('  node ./scripts/run-google-tv-emulator.mjs --mode live [--serial emulator-5554] [--host 10.0.2.2] [--port 5173] [--sync]');
  console.log('');
  console.log('Short flags:');
  console.log('  --live   (same as --mode live)');
  console.log('  --apk    (same as --mode apk)');
  console.log('');
  console.log('Notes:');
  console.log('  - If --serial is omitted, this script auto-selects a connected Android TV emulator.');
  console.log('  - For live mode, start Vite in another terminal: npm run dev:tv');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? webRoot,
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT' && /adb(\.exe)?$/i.test(command)) {
      throw new Error(
        `Unable to find adb at ${command}. Run npm run android:configure-sdk and make sure Android SDK platform-tools are installed.`,
      );
    }

    if (result.error.code === 'ENOENT' && /npm(\.cmd)?$/i.test(command)) {
      throw new Error(
        `Unable to find npm at ${command}. Install Node.js/npm and ensure it is on PATH, or run this script via npm run.`,
      );
    }

    if (result.error.code === 'ENOENT' && /npx(\.cmd)?$/i.test(command)) {
      throw new Error(
        `Unable to find npx at ${command}. Install Node.js/npm and ensure it is on PATH, or use npm exec fallback.`,
      );
    }

    throw new Error(`Failed to execute ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 'unknown'}`);
  }

  return result;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? webRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT' && /adb(\.exe)?$/i.test(command)) {
      throw new Error(
        `Unable to find adb at ${command}. Run npm run android:configure-sdk and make sure Android SDK platform-tools are installed.`,
      );
    }

    if (result.error.code === 'ENOENT' && /npm(\.cmd)?$/i.test(command)) {
      throw new Error(
        `Unable to find npm at ${command}. Install Node.js/npm and ensure it is on PATH, or run this script via npm run.`,
      );
    }

    if (result.error.code === 'ENOENT' && /npx(\.cmd)?$/i.test(command)) {
      throw new Error(
        `Unable to find npx at ${command}. Install Node.js/npm and ensure it is on PATH, or use npm exec fallback.`,
      );
    }

    throw new Error(`Failed to execute ${command}: ${result.error.message}`);
  }

  return result;
}

function runNpm(args, options = {}) {
  return run(
    npmRuntime.npmCommand,
    [...npmRuntime.npmBaseArgs, ...args],
    options,
  );
}

function runNpx(args, options = {}) {
  if (npmRuntime.canUseNpmExec) {
    return run(
      npmRuntime.npmCommand,
      [...npmRuntime.npmBaseArgs, 'exec', '--', ...args],
      options,
    );
  }

  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return run(npxCommand, args, options);
}

function runCap(args, options = {}) {
  if (capRuntime) {
    return run(
      capRuntime.command,
      [...capRuntime.baseArgs, ...args],
      options,
    );
  }

  return runNpx(['cap', ...args], options);
}

function parseArgs(argv) {
  const options = {
    list: false,
    mode: 'apk',
    serial: '',
    host: '10.0.2.2',
    port: '5173',
    sync: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
    }

    if (token === '--list') {
      options.list = true;
      continue;
    }

    if (token === '--live') {
      options.mode = 'live';
      continue;
    }

    if (token === '--apk') {
      options.mode = 'apk';
      continue;
    }

    if (token === '--sync') {
      options.sync = true;
      continue;
    }

    if (token === '--no-sync') {
      options.sync = false;
      continue;
    }

    if (token.startsWith('--mode=')) {
      options.mode = token.slice('--mode='.length).trim().toLowerCase();
      continue;
    }

    if (token === '--mode') {
      options.mode = (argv[index + 1] ?? '').trim().toLowerCase();
      index += 1;
      continue;
    }

    if (token.startsWith('--serial=')) {
      options.serial = token.slice('--serial='.length).trim();
      continue;
    }

    if (token === '--serial') {
      options.serial = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--host=')) {
      options.host = token.slice('--host='.length).trim();
      continue;
    }

    if (token === '--host') {
      options.host = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }

    if (token.startsWith('--port=')) {
      options.port = token.slice('--port='.length).trim();
      continue;
    }

    if (token === '--port') {
      options.port = (argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }

    if (!token.startsWith('-') && !options.serial) {
      options.serial = token.trim();
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (options.mode !== 'apk' && options.mode !== 'live') {
    throw new Error(`Unsupported mode: ${options.mode}. Expected "apk" or "live".`);
  }

  if (!options.host) {
    throw new Error('Host cannot be empty.');
  }

  const portNumber = Number(options.port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  options.port = String(portNumber);
  return options;
}

function parseConnectedDevices() {
  const result = capture(adbExecutable, ['devices', '-l']);
  if (result.status !== 0) {
    throw new Error(`adb devices failed with code ${result.status ?? 'unknown'}`);
  }

  const devices = [];
  const lines = (result.stdout ?? '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('List of devices attached')) {
      continue;
    }

    const [serial = '', state = '', ...metaParts] = trimmed.split(/\s+/);
    if (!serial || !state) {
      continue;
    }

    const metadata = metaParts.join(' ');
    const modelMatch = metadata.match(/model:([^\s]+)/i);
    const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'unknown';

    devices.push({
      serial,
      state,
      metadata,
      model,
      isEmulator: serial.startsWith('emulator-') || /emulator/i.test(metadata),
      isTv: false,
      characteristics: '',
    });
  }

  return devices;
}

function queryDeviceProperty(serial, propName) {
  const result = capture(adbExecutable, ['-s', serial, 'shell', 'getprop', propName]);
  if (result.status !== 0) {
    return '';
  }

  return (result.stdout ?? '').trim();
}

function hydrateTvMetadata(device) {
  const characteristics = queryDeviceProperty(device.serial, 'ro.build.characteristics');
  const productModel = queryDeviceProperty(device.serial, 'ro.product.model');
  const fingerprintText = `${characteristics} ${productModel} ${device.model} ${device.metadata}`.toLowerCase();

  device.characteristics = characteristics;
  device.isTv = /(^|[,\s])tv([,\s]|$)/i.test(characteristics)
    || /google\s*tv|android\s*tv|leanback|\btv\b/i.test(fingerprintText);
}

function selectTargetDevice(devices, explicitSerial) {
  const onlineDevices = devices.filter((device) => device.state === 'device');

  if (onlineDevices.length === 0) {
    throw new Error('No online adb devices found. Start your Google TV emulator from Android Studio first.');
  }

  for (const device of onlineDevices) {
    hydrateTvMetadata(device);
  }

  const requestedSerial = explicitSerial || process.env.ANDROID_SERIAL?.trim() || '';
  if (requestedSerial) {
    const match = onlineDevices.find((device) => device.serial === requestedSerial);
    if (!match) {
      throw new Error(`Requested serial ${requestedSerial} is not connected.`);
    }

    return match;
  }

  return onlineDevices.find((device) => device.isTv && device.isEmulator)
    ?? onlineDevices.find((device) => device.isTv)
    ?? onlineDevices.find((device) => device.isEmulator)
    ?? onlineDevices[0];
}

function printDeviceTable(devices, selectedSerial) {
  if (devices.length === 0) {
    console.log('No adb devices detected.');
    return;
  }

  console.log('Connected devices:');
  for (const device of devices) {
    const isSelected = selectedSerial && device.serial === selectedSerial;
    const marker = isSelected ? '*' : ' ';
    const tags = [
      device.state,
      device.isEmulator ? 'emulator' : 'device',
      device.isTv ? 'tv' : 'non-tv',
    ].join(', ');

    console.log(`${marker} ${device.serial.padEnd(16)} ${tags.padEnd(24)} ${device.model}`);
  }
}

function stabilizeAdbForLiveMode(devices) {
  const nonReadyDevices = devices.filter((device) => device.state !== 'device');
  if (nonReadyDevices.length === 0) {
    return devices;
  }

  const summary = nonReadyDevices
    .map((device) => `${device.serial} (${device.state})`)
    .join(', ');

  console.log(`Detected non-ready adb entries: ${summary}`);
  console.log('Restarting adb server before live deployment...');

  run(adbExecutable, ['kill-server']);
  run(adbExecutable, ['start-server']);

  return parseConnectedDevices();
}

function runApkMode(targetDevice) {
  console.log(`Building debug APK for target ${targetDevice.serial}...`);
  runNpm(['run', 'android:build:debug']);

  if (!existsSync(debugApkPath)) {
    throw new Error(`Debug APK not found at ${debugApkPath}`);
  }

  console.log(`Installing debug APK on ${targetDevice.serial}...`);
  run(adbExecutable, ['-s', targetDevice.serial, 'install', '-r', debugApkPath]);

  console.log('Launching app on emulator...');
  run(adbExecutable, [
    '-s',
    targetDevice.serial,
    'shell',
    'am',
    'start',
    '-n',
    `${APP_ID}/${APP_ACTIVITY}`,
  ]);

  console.log(`Success: ${APP_ID} is running on ${targetDevice.serial}.`);
}

function runLiveMode(targetDevice, host, port, sync) {
  console.log(`Running live-reload on ${targetDevice.serial} via http://${host}:${port}...`);
  console.log('Make sure Vite is running in another terminal: npm run dev:tv');

  const args = [
    'run',
    'android',
    '--target',
    targetDevice.serial,
    '--live-reload',
    '--host',
    host,
    '--port',
    port,
  ];

  if (!sync) {
    args.push('--no-sync');
  }

  runCap(args, {
    env: {
      ...process.env,
      ANDROID_SERIAL: targetDevice.serial,
    },
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let devices = parseConnectedDevices();

  if (options.list) {
    let suggestedTarget = null;
    try {
      if (devices.length > 0) {
        suggestedTarget = selectTargetDevice(devices, options.serial);
      }
    } catch {
      // Listing should still succeed even if there is no valid online target.
    }

    printDeviceTable(devices, suggestedTarget?.serial ?? '');
    if (suggestedTarget) {
      console.log(`Suggested target: ${suggestedTarget.serial}`);
    } else {
      console.log('No online target selected. Start a Google TV emulator and run again.');
    }
    return;
  }

  if (options.mode === 'live') {
    devices = stabilizeAdbForLiveMode(devices);
  }

  const targetDevice = selectTargetDevice(devices, options.serial);

  if (!targetDevice) {
    throw new Error('No target device found.');
  }

  printDeviceTable(devices, targetDevice.serial);

  if (options.mode === 'apk') {
    runApkMode(targetDevice);
    return;
  }

  runLiveMode(targetDevice, options.host, options.port, options.sync);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
