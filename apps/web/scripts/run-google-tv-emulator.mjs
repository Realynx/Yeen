#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  createProcessRunners,
  parseConnectedDevices,
  printDeviceTable,
  resolveAdbExecutable,
  selectTargetDevice,
  stabilizeAdbForLiveMode,
} from './google-tv-emulator.helpers.mjs';

const APP_ID = 'com.yeen.client';
const APP_ACTIVITY = '.MainActivity';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const adbExecutable = resolveAdbExecutable(webRoot);
const { run, capture, runNpm, runCap } = createProcessRunners(webRoot);
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

const SIMPLE_FLAG_UPDATES = new Map([
  ['--list', ['list', true]],
  ['--live', ['mode', 'live']],
  ['--apk', ['mode', 'apk']],
  ['--sync', ['sync', true]],
  ['--no-sync', ['sync', false]],
]);
const VALUE_FLAG_PATTERN = /^--(mode|serial|host|port)(?:=(.*))?$/;

function applyArgument(argv, index, options) {
  const token = argv[index];
  const simpleUpdate = SIMPLE_FLAG_UPDATES.get(token);
  if (simpleUpdate) {
    const [key, value] = simpleUpdate;
    options[key] = value;
    return 0;
  }

  const valueFlag = token.match(VALUE_FLAG_PATTERN);
  if (valueFlag) {
    const [, key, inlineValue] = valueFlag;
    const rawValue = inlineValue ?? argv[index + 1] ?? '';
    options[key] = key === 'mode'
      ? rawValue.trim().toLowerCase()
      : rawValue.trim();
    return inlineValue === undefined ? 1 : 0;
  }

  if (!token.startsWith('-') && !options.serial) {
    options.serial = token.trim();
    return 0;
  }

  throw new Error(`Unknown argument: ${token}`);
}

function validateMode(mode) {
  if (mode !== 'apk' && mode !== 'live') {
    throw new Error(`Unsupported mode: ${mode}. Expected "apk" or "live".`);
  }
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

    index += applyArgument(argv, index, options);
  }

  validateMode(options.mode);

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

function loadConnectedDevices() {
  return parseConnectedDevices(adbExecutable, capture);
}

function pickTargetDevice(devices, explicitSerial) {
  return selectTargetDevice(adbExecutable, capture, devices, explicitSerial);
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
  let devices = loadConnectedDevices();

  if (options.list) {
    let suggestedTarget = null;
    try {
      if (devices.length > 0) {
        suggestedTarget = pickTargetDevice(devices, options.serial);
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
    devices = stabilizeAdbForLiveMode(
      adbExecutable,
      run,
      (nextAdbExecutable) => parseConnectedDevices(nextAdbExecutable, capture),
      devices,
    );
  }

  const targetDevice = pickTargetDevice(devices, options.serial);

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
