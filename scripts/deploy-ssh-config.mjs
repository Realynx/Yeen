const SSH_TARGET_PATTERN = /^[A-Za-z0-9._@-]+$/;
const CONTAINER_ID_PATTERN = /^\d{1,6}$/;
const SERVICE_NAME_PATTERN = /^[A-Za-z0-9_.@-]+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9._-]{3,96}$/;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
const INSTALL_ROOT_PATTERN =
  /^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const TLS_HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

function optionValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function safeInstallRoot(value, label) {
  const components = value.split("/").filter(Boolean);
  if (
    !INSTALL_ROOT_PATTERN.test(value) ||
    components.some((component) => component === "." || component === "..")
  ) {
    throw new Error(
      `${label} must be an absolute path with at least two safe components.`,
    );
  }
}

const BOOLEAN_OPTIONS = new Map([
  ["--rollback", "rollback"],
  ["--allow-dirty", "allowDirty"],
  ["--skip-build", "skipBuild"],
]);

const VALUE_OPTIONS = new Map([
  ["--host", "sshTarget"],
  ["--container", "containerId"],
  ["--deploy-root", "deployRoot"],
  ["--legacy-root", "legacyRoot"],
  ["--service-name", "serviceName"],
  ["--update-repository", "updateRepository"],
  ["--update-channel", "updateChannel"],
  ["--tls-hostname", "tlsHostname"],
  ["--addon-root", "addonRoot"],
  ["--addon-key", "addonSigningKey"],
]);

function applyDeployOption(options, args, index) {
  const option = args[index];
  const booleanProperty = BOOLEAN_OPTIONS.get(option);
  if (booleanProperty) {
    options[booleanProperty] = true;
    return index;
  }

  const valueProperty = VALUE_OPTIONS.get(option);
  if (!valueProperty) {
    throw new Error(`Unknown option: ${option}`);
  }
  options[valueProperty] = optionValue(args, index, option);
  return index + 1;
}

function validateTlsHostname(hostname) {
  if (
    hostname.length > 253
    || !TLS_HOSTNAME_PATTERN.test(hostname)
    || hostname.includes("..")
  ) {
    throw new Error("Invalid TLS hostname.");
  }
}

function validateDeployOptions(options) {
  const patternChecks = [
    [SSH_TARGET_PATTERN, options.sshTarget, "Invalid SSH target."],
    [CONTAINER_ID_PATTERN, options.containerId, "Invalid Proxmox container ID."],
    [SERVICE_NAME_PATTERN, options.serviceName, "Invalid systemd service name."],
    [REPOSITORY_PATTERN, options.updateRepository, "Invalid update repository."],
  ];
  for (const [pattern, value, message] of patternChecks) {
    if (!pattern.test(value)) throw new Error(message);
  }
  safeInstallRoot(options.deployRoot, "Deployment root");
  safeInstallRoot(options.legacyRoot, "Legacy root");
  if (!["stable", "prerelease"].includes(options.updateChannel)) {
    throw new Error("Invalid update channel.");
  }
  validateTlsHostname(options.tlsHostname);
}

export function parseDeploySshOptions(args, environment = process.env) {
  const options = {
    rollback: false,
    allowDirty: false,
    skipBuild: false,
    sshTarget: environment.YEEN_SSH_TARGET || "zen",
    containerId: environment.YEEN_PROXMOX_CONTAINER_ID || "139",
    deployRoot: environment.YEEN_DEPLOY_ROOT || "/opt/yeen",
    legacyRoot: environment.YEEN_LEGACY_ROOT || "/var/www/yeen",
    serviceName: environment.YEEN_SERVICE_NAME || "yeen",
    updateRepository: environment.YEEN_UPDATE_REPOSITORY || "Realynx/Yeen",
    updateChannel: environment.YEEN_UPDATE_CHANNEL || "stable",
    tlsHostname: environment.YEEN_TLS_HOSTNAME || "yeen.fox",
    addonRoot:
      environment.YEEN_DOWNLOADER_ADDON_ROOT || "private/yeen-downloader-addon",
    addonSigningKey: environment.YEEN_DOWNLOADER_ADDON_SIGNING_KEY || "",
  };

  for (let index = 0; index < args.length; index += 1) {
    index = applyDeployOption(options, args, index);
  }

  validateDeployOptions(options);
  return options;
}

function remoteEnvironment(options) {
  return [
    `YEEN_DEPLOY_ROOT=${options.deployRoot}`,
    `YEEN_LEGACY_ROOT=${options.legacyRoot}`,
    `YEEN_SERVICE_NAME=${options.serviceName}`,
    `YEEN_UPDATE_REPOSITORY=${options.updateRepository}`,
    `YEEN_UPDATE_CHANNEL=${options.updateChannel}`,
    `YEEN_TLS_HOSTNAME=${options.tlsHostname}`,
  ].join(" ");
}

export function createRemoteDeployPlan(options, releaseId, sha256) {
  const environment = remoteEnvironment(options);
  const installedReleaseInstaller = `${options.deployRoot}/current/deployment/scripts/install-release.sh`;
  const rollbackCommand =
    `pct exec ${options.containerId} -- env ${environment} bash ${installedReleaseInstaller}` +
    ` unused unused ${"0".repeat(64)} --rollback`;
  if (options.rollback) return { rollbackCommand };

  if (!RELEASE_ID_PATTERN.test(releaseId ?? ""))
    throw new Error("Invalid release ID.");
  if (!SHA256_PATTERN.test(sha256 ?? ""))
    throw new Error("Invalid release checksum.");

  const installerDirectory = `/root/yeen-installer-${releaseId}`;
  const archiveOnHost = `/tmp/yeen-${releaseId}.zip`;
  const archiveInContainer = `/root/yeen-${releaseId}.zip`;
  const installerFiles = [
    {
      localPath: "deployment/scripts/install.sh",
      containerName: "install.sh",
      mode: "0700",
    },
    {
      localPath: "deployment/scripts/install-lib.sh",
      containerName: "install-lib.sh",
      mode: "0600",
    },
    {
      localPath: "deployment/scripts/install-release.sh",
      containerName: "install-release.sh",
      mode: "0700",
    },
  ].map((entry) => ({
    ...entry,
    hostPath: `/tmp/yeen-${entry.containerName}-${releaseId}`,
    containerPath: `${installerDirectory}/${entry.containerName}`,
  }));
  const prepareAndPushCommands = [
    `pct exec ${options.containerId} -- install -d -m 0700 ${installerDirectory}`,
    `pct push ${options.containerId} ${archiveOnHost} ${archiveInContainer} --perms 0600`,
    ...installerFiles.map(
      (entry) =>
        `pct push ${options.containerId} ${entry.hostPath} ${entry.containerPath} --perms ${entry.mode}`,
    ),
  ];
  const installCommand =
    `pct exec ${options.containerId} -- env ${environment} YEEN_NON_INTERACTIVE=1` +
    ` bash ${installerDirectory}/install.sh --archive ${archiveInContainer}` +
    ` --sha256 ${sha256} --release-id ${releaseId} --non-interactive`;
  const verifyReleaseCommand =
    `pct exec ${options.containerId} -- sh -c '` +
    `test "$(readlink -f ${options.deployRoot}/current)"` +
    ` = ${options.deployRoot}/releases/${releaseId}'`;
  const sharedEnvironment = `${options.deployRoot}/shared/yeen.env`;
  const sharedAccounts = `${options.deployRoot}/shared/data/accounts.json`;
  const legacyEnvironment = `${options.legacyRoot}/.env`;
  const legacyAccounts = `${options.legacyRoot}/data/accounts.json`;
  const preflightCommand =
    `pct status ${options.containerId} | grep -q '^status: running$'` +
    ` && ((pct exec ${options.containerId} -- test -f ${sharedEnvironment}` +
    ` && pct exec ${options.containerId} -- test -f ${sharedAccounts})` +
    ` || (pct exec ${options.containerId} -- test -f ${legacyEnvironment}` +
    ` && pct exec ${options.containerId} -- test -f ${legacyAccounts}))` +
    ` && pct exec ${options.containerId} -- sh -c '` +
    `if [ -e /dev/nvidia0 ] || [ -e /dev/nvidia-uvm ]; then ` +
    `test -c /dev/nvidia0 && test -c /dev/nvidiactl` +
    ` && test -c /dev/nvidia-uvm` +
    ` && ffmpeg -nostdin -hide_banner -loglevel error` +
    ` -f lavfi -i color=size=256x256:rate=1 -frames:v 1 -an` +
    ` -c:v h264_nvenc -f null -; fi'`;
  const hostCleanupCommand = `rm -f ${archiveOnHost} ${installerFiles.map((entry) => entry.hostPath).join(" ")}`;
  const containerCleanupCommand =
    `pct exec ${options.containerId} -- rm -f ${archiveInContainer}` +
    ` && pct exec ${options.containerId} -- rm -rf -- ${installerDirectory}`;
  return {
    rollbackCommand,
    installerDirectory,
    archiveOnHost,
    archiveInContainer,
    installerFiles,
    prepareAndPushCommands,
    preflightCommand,
    installCommand,
    verifyReleaseCommand,
    hostCleanupCommand,
    containerCleanupCommand,
  };
}
