import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function decodeJavaPropertiesValue(value) {
  return value
    .replace(/\:/g, ':')
    .replace(/\=/g, '=')
    .replace(/\\/g, '\\');
}

function readSdkDirFromLocalProperties(webRoot) {
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

export function resolveAdbExecutable(webRoot) {
  const binaryName = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [];

  const sdkDirFromEnv = process.env.ANDROID_SDK_ROOT?.trim()
    || process.env.ANDROID_HOME?.trim()
    || '';
  if (sdkDirFromEnv) {
    candidates.push(path.resolve(sdkDirFromEnv, 'platform-tools', binaryName));
  }

  const sdkDirFromLocalProperties = readSdkDirFromLocalProperties(webRoot);
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

function resolveNpmRuntime() {
  const npmCli = process.env.npm_execpath?.trim() ?? '';
  if (npmCli) {
    return {
      npmCommand: process.execPath,
      npmBaseArgs: [npmCli],
      canUseNpmExec: true,
    };
  }

  const installedNpmCli = path.resolve(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  if (existsSync(installedNpmCli)) {
    return {
      npmCommand: process.execPath,
      npmBaseArgs: [installedNpmCli],
      canUseNpmExec: true,
    };
  }

  return {
    npmCommand: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    npmBaseArgs: [],
    canUseNpmExec: false,
  };
}

function resolveCapRuntime(webRoot) {
  const localCapCli = path.resolve(
    webRoot,
    'node_modules',
    '@capacitor',
    'cli',
    'bin',
    'capacitor',
  );
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

function createRunError(command, resultError) {
  if (resultError.code === 'ENOENT' && /adb(\.exe)?$/i.test(command)) {
    return new Error(
      `Unable to find adb at ${command}. Run npm run android:configure-sdk and make sure Android SDK platform-tools are installed.`,
    );
  }

  if (resultError.code === 'ENOENT' && /npm(\.cmd)?$/i.test(command)) {
    return new Error(
      `Unable to find npm at ${command}. Install Node.js/npm and ensure it is on PATH, or run this script via npm run.`,
    );
  }

  if (resultError.code === 'ENOENT' && /npx(\.cmd)?$/i.test(command)) {
    return new Error(
      `Unable to find npx at ${command}. Install Node.js/npm and ensure it is on PATH, or use npm exec fallback.`,
    );
  }

  return new Error(`Failed to execute ${command}: ${resultError.message}`);
}

export function createProcessRunners(webRoot) {
  const npmRuntime = resolveNpmRuntime();
  const capRuntime = resolveCapRuntime(webRoot);

  function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? webRoot,
      stdio: options.stdio ?? 'inherit',
      encoding: 'utf8',
      env: options.env ?? process.env,
      shell: false,
    });

    if (result.error) {
      throw createRunError(command, result.error);
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
      throw createRunError(command, result.error);
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

  return {
    run,
    capture,
    runNpm,
    runCap,
  };
}

export function parseConnectedDevices(adbExecutable, capture) {
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

function queryDeviceProperty(adbExecutable, capture, serial, propName) {
  const result = capture(adbExecutable, ['-s', serial, 'shell', 'getprop', propName]);
  if (result.status !== 0) {
    return '';
  }

  return (result.stdout ?? '').trim();
}

function hydrateTvMetadata(adbExecutable, capture, device) {
  const characteristics = queryDeviceProperty(
    adbExecutable,
    capture,
    device.serial,
    'ro.build.characteristics',
  );
  const productModel = queryDeviceProperty(
    adbExecutable,
    capture,
    device.serial,
    'ro.product.model',
  );
  const fingerprintText = `${characteristics} ${productModel} ${device.model} ${device.metadata}`.toLowerCase();

  device.characteristics = characteristics;
  device.isTv = /(^|[,\s])tv([,\s]|$)/i.test(characteristics)
    || /google\s*tv|android\s*tv|leanback|\btv\b/i.test(fingerprintText);
}

export function selectTargetDevice(adbExecutable, capture, devices, explicitSerial) {
  const onlineDevices = devices.filter((device) => device.state === 'device');

  if (onlineDevices.length === 0) {
    throw new Error(
      'No online adb devices found. Start your Google TV emulator from Android Studio first.',
    );
  }

  for (const device of onlineDevices) {
    hydrateTvMetadata(adbExecutable, capture, device);
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

export function printDeviceTable(devices, selectedSerial) {
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

export function stabilizeAdbForLiveMode(
  adbExecutable,
  run,
  parseDevices,
  devices,
) {
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

  return parseDevices(adbExecutable);
}
