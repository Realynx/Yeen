import assert from "node:assert/strict";
import test from "node:test";

import {
  createRemoteDeployPlan,
  parseDeploySshOptions,
} from "./deploy-ssh-config.mjs";

test("deployment target defaults are explicit and environment-overridable", () => {
  assert.deepEqual(parseDeploySshOptions([], {}), {
    rollback: false,
    allowDirty: false,
    skipBuild: false,
    sshTarget: "zen",
    containerId: "139",
    deployRoot: "/opt/yeen",
    legacyRoot: "/var/www/yeen",
    serviceName: "yeen",
    updateRepository: "Realynx/Yeen",
    updateChannel: "stable",
    tlsHostname: "yeen.fox",
    addonRoot: "private/yeen-downloader-addon",
    addonSigningKey: "",
  });

  const configured = parseDeploySshOptions(
    [
      "--host",
      "cli-host",
      "--container",
      "140",
      "--addon-root",
      "private/custom-downloader",
      "--addon-key",
      "C:/keys/downloader.pem",
      "--tls-hostname",
      "media.internal",
    ],
    {
      YEEN_SSH_TARGET: "env-host",
      YEEN_PROXMOX_CONTAINER_ID: "141",
      YEEN_DEPLOY_ROOT: "/srv/yeen/app",
      YEEN_LEGACY_ROOT: "/srv/yeen/legacy",
      YEEN_SERVICE_NAME: "yeen-custom",
      YEEN_UPDATE_REPOSITORY: "private/yeen",
      YEEN_UPDATE_CHANNEL: "prerelease",
      YEEN_DOWNLOADER_ADDON_ROOT: "private/env-downloader",
      YEEN_DOWNLOADER_ADDON_SIGNING_KEY: "C:/keys/env.pem",
    },
  );
  assert.equal(configured.sshTarget, "cli-host");
  assert.equal(configured.containerId, "140");
  assert.equal(configured.deployRoot, "/srv/yeen/app");
  assert.equal(configured.updateRepository, "private/yeen");
  assert.equal(configured.updateChannel, "prerelease");
  assert.equal(configured.addonRoot, "private/custom-downloader");
  assert.equal(configured.addonSigningKey, "C:/keys/downloader.pem");
  assert.equal(configured.tlsHostname, "media.internal");
});

test("invalid or ambiguous deployment arguments are rejected", () => {
  assert.throws(
    () => parseDeploySshOptions(["--host"], {}),
    /requires a value/,
  );
  assert.throws(
    () => parseDeploySshOptions(["--unknown"], {}),
    /Unknown option/,
  );
  assert.throws(
    () => parseDeploySshOptions([], { YEEN_DEPLOY_ROOT: "/" }),
    /deployment root/i,
  );
  assert.throws(
    () => parseDeploySshOptions([], { YEEN_DEPLOY_ROOT: "/opt/yeen/../other" }),
    /deployment root/i,
  );
  assert.throws(
    () =>
      parseDeploySshOptions([], { YEEN_UPDATE_REPOSITORY: "not-a-repository" }),
    /repository/i,
  );
  assert.throws(
    () => parseDeploySshOptions(["--tls-hostname", "bad/name"], {}),
    /TLS hostname/i,
  );
});

test("upgrade plan invokes the high-level installer without transferring state", () => {
  const options = parseDeploySshOptions([], {});
  const plan = createRemoteDeployPlan(
    options,
    "20260719120000-abcdef1234",
    "a".repeat(64),
  );
  assert.match(
    plan.installCommand,
    /\/root\/yeen-installer-20260719120000-abcdef1234\/install\.sh/,
  );
  assert.match(plan.installCommand, /--non-interactive/);
  assert.match(plan.installCommand, /YEEN_DEPLOY_ROOT=\/opt\/yeen/);
  assert.match(plan.installCommand, /YEEN_LEGACY_ROOT=\/var\/www\/yeen/);
  assert.match(plan.installCommand, /YEEN_UPDATE_REPOSITORY=Realynx\/Yeen/);
  assert.match(plan.installCommand, /YEEN_TLS_HOSTNAME=yeen\.fox/);
  assert.match(plan.verifyReleaseCommand, /readlink -f \/opt\/yeen\/current/);
  assert.match(plan.verifyReleaseCommand, /20260719120000-abcdef1234/);
  assert.match(plan.preflightCommand, /pct status 139/);
  assert.match(plan.preflightCommand, /\/opt\/yeen\/shared\/yeen\.env/);
  assert.match(
    plan.preflightCommand,
    /\/opt\/yeen\/shared\/data\/accounts\.json/,
  );
  assert.match(plan.preflightCommand, /\/var\/www\/yeen\/\.env/);
  assert.match(plan.preflightCommand, /\/var\/www\/yeen\/data\/accounts\.json/);
  assert.match(plan.preflightCommand, /\/dev\/nvidia0/);
  assert.match(plan.preflightCommand, /\/dev\/nvidia-uvm/);
  assert.match(plan.preflightCommand, /h264_nvenc/);
  assert.deepEqual(
    plan.installerFiles.map((entry) => entry.containerName).sort(),
    ["install-lib.sh", "install-release.sh", "install.sh"],
  );
  assert.ok(
    plan.installerFiles.every(
      (entry) => !/\.env|data|addons/i.test(entry.localPath),
    ),
  );
});

test("rollback uses the installed release rather than a temporary root copy", () => {
  const options = parseDeploySshOptions(["--rollback"], {});
  const plan = createRemoteDeployPlan(options);
  assert.equal(
    plan.rollbackCommand,
    "pct exec 139 -- env YEEN_DEPLOY_ROOT=/opt/yeen YEEN_LEGACY_ROOT=/var/www/yeen YEEN_SERVICE_NAME=yeen YEEN_UPDATE_REPOSITORY=Realynx/Yeen YEEN_UPDATE_CHANNEL=stable YEEN_TLS_HOSTNAME=yeen.fox bash /opt/yeen/current/deployment/scripts/install-release.sh unused unused " +
      "0".repeat(64) +
      " --rollback",
  );
  assert.doesNotMatch(plan.rollbackCommand, /\/root\/yeen-install-release\.sh/);
});
