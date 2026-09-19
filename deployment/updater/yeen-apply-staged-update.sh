#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${YEEN_DEPLOY_ROOT:-/opt/yeen}"
INSTANCE="${1:-}"
REPOSITORY="${YEEN_UPDATE_REPOSITORY:-}"
CHANNEL="${YEEN_UPDATE_CHANNEL:-stable}"
MAX_ARCHIVE_BYTES="${YEEN_UPDATE_MAX_ARCHIVE_BYTES:-2147483648}"
STAGING_ROOT="${YEEN_UPDATE_STAGING_ROOT:-$ROOT/shared/data/updates}"
STATUS_ROOT="${YEEN_UPDATE_STATUS_ROOT:-$ROOT/shared/update-status}"
SERVICE_GROUP="${YEEN_SERVICE_GROUP:-www-data}"
NODE_BINARY="${YEEN_NODE_BINARY:-}"
INSTALLER="$ROOT/current/deployment/scripts/install-release.sh"
FETCHER="$ROOT/current/deployment/updater/root-release-fetch.mjs"
INCOMING_DIR=""

fail() { printf '[yeen-update] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$INCOMING_DIR" && "$INCOMING_DIR" == "$ROOT/incoming/root-update."* ]]; then
    rm -rf -- "$INCOMING_DIR"
  fi
}
trap cleanup EXIT

[[ "$INSTANCE" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ ]] \
  || fail "Invalid update job identifier."
JOB_ID="$INSTANCE"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Privileged update helper must run as root."
[[ "$ROOT" == /* && "$ROOT" != "/" ]] || fail "Deployment root is invalid."
[[ "$REPOSITORY" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] \
  || fail "Configured update repository is invalid."
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "prerelease" ]] \
  || fail "Configured update channel is invalid."
[[ "$MAX_ARCHIVE_BYTES" =~ ^[0-9]+$ && "$MAX_ARCHIVE_BYTES" -ge 1048576 ]] \
  || fail "Configured archive size limit is invalid."
[[ -x "$INSTALLER" ]] || fail "Release installer is unavailable."
[[ -f "$FETCHER" ]] || fail "Privileged release verifier is unavailable."
[[ "$SERVICE_GROUP" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Service group is invalid."
[[ "$NODE_BINARY" == /* && -x "$NODE_BINARY" ]] || fail "Configured Node binary is invalid."
NODE_BINARY="$(readlink -f "$NODE_BINARY")"
[[ "$(stat -c '%u' "$NODE_BINARY")" == "0" ]] || fail "Configured Node binary is not root-owned."

# The request is explicitly untrusted. Read only an exact {jobId, version}
# intent; archive paths, bytes, hashes, and metadata are never accepted here.
REQUEST_FILE="$STAGING_ROOT/staged/$JOB_ID/request.json"
VERSION="$("$NODE_BINARY" "$FETCHER" intent "$REQUEST_FILE" "$JOB_ID")" \
  || fail "Untrusted update request is invalid."

# Both directories are outside service-writable data. The helper never reads
# request.json, ZIPs, checksums, or metadata from shared/data/updates.
install -d -o root -g root -m 0700 "$ROOT/incoming"
install -d -o root -g "$SERVICE_GROUP" -m 0750 "$STATUS_ROOT"
[[ ! -L "$STATUS_ROOT" && "$(stat -c '%u' "$STATUS_ROOT")" == "0" ]] \
  || fail "Update status directory is not root-owned."
INCOMING_DIR="$(mktemp -d "$ROOT/incoming/root-update.${JOB_ID}.XXXXXX")"
chmod 0700 "$INCOMING_DIR"

mapfile -d '' fields < <(
  "$NODE_BINARY" "$FETCHER" fetch \
    "$ROOT" "$REPOSITORY" "$CHANNEL" "$VERSION" "$INCOMING_DIR" "$MAX_ARCHIVE_BYTES"
) || fail "Root-owned GitHub release verification failed."
[[ "${#fields[@]}" -eq 3 ]] || fail "Verified GitHub release result is incomplete."
ARCHIVE_PATH="${fields[0]}"
EXPECTED_SHA="${fields[1]}"
VERIFIED_VERSION="${fields[2]}"
[[ "$VERIFIED_VERSION" == "$VERSION" ]] || fail "Verified release version changed unexpectedly."
[[ "$ARCHIVE_PATH" == "$INCOMING_DIR/yeen-v${VERSION}.zip" && -f "$ARCHIVE_PATH" ]] \
  || fail "Verified release archive path is invalid."
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{64}$ ]] || fail "Verified release checksum is invalid."

STATUS_FILE="$STATUS_ROOT/$JOB_ID.json"
write_status() {
  local phase="$1"
  local message="$2"
  "$NODE_BINARY" - "$STATUS_FILE" "$JOB_ID" "$VERSION" "$phase" "$message" <<'NODE'
const { lstatSync, renameSync, writeFileSync } = require('node:fs');
const [file, jobId, version, phase, message] = process.argv.slice(2);
try { if (lstatSync(file).isSymbolicLink()) process.exit(2); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const temporary = `${file}.new.${process.pid}`;
writeFileSync(temporary, `${JSON.stringify({
  schemaVersion: 1,
  jobId,
  version,
  phase,
  message,
  updatedAt: new Date().toISOString(),
}, null, 2)}\n`, { mode: 0o640, flag: 'wx' });
renameSync(temporary, file);
NODE
  chown "root:$SERVICE_GROUP" "$STATUS_FILE"
  chmod 0640 "$STATUS_FILE"
}

RELEASE_ID="v${VERSION}-${JOB_ID:0:8}"
write_status applying "Root independently verified GitHub assets; backup and cutover are in progress."
if "$INSTALLER" "$RELEASE_ID" "$ARCHIVE_PATH" "$EXPECTED_SHA"; then
  write_status succeeded "Yeen $VERSION installed successfully; backup and health checks passed."
else
  exit_code=$?
  write_status failed "Yeen $VERSION failed health verification; the previous release remains active or was restored (installer exit $exit_code)."
  exit "$exit_code"
fi
