#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${YEEN_DEPLOY_ROOT:-/opt/yeen}"
LEGACY_ROOT="${YEEN_LEGACY_ROOT:-/var/www/yeen}"
SERVICE="${YEEN_SERVICE_NAME:-yeen}"
UPDATE_REPOSITORY="${YEEN_UPDATE_REPOSITORY:-Realynx/Yeen}"
UPDATE_CHANNEL="${YEEN_UPDATE_CHANNEL:-stable}"
UPDATE_MAX_ARCHIVE_BYTES="${YEEN_UPDATE_MAX_ARCHIVE_BYTES:-2147483648}"
SERVICE_USER="${YEEN_SERVICE_USER:-www-data}"
SERVICE_GROUP="${YEEN_SERVICE_GROUP:-www-data}"
UNIT_PATH="${YEEN_UNIT_PATH:-/etc/systemd/system/${SERVICE}.service}"
UPDATE_UNIT_PATH="${YEEN_UPDATE_UNIT_PATH:-/etc/systemd/system/yeen-update@.service}"
UPDATE_SUDOERS_PATH="${YEEN_UPDATE_SUDOERS_PATH:-/etc/sudoers.d/yeen-update}"
LOCK_FILE="${YEEN_LOCK_FILE:-/run/lock/yeen-deploy.lock}"
RELEASE_ID="${1:-}"
ARCHIVE_PATH="${2:-}"
EXPECTED_SHA="${3:-}"
ROLLBACK_MODE="${4:-}"
ORIGINAL_UNIT_BACKUP=""
ORIGINAL_UNIT_EXISTED=0
ORIGINAL_UPDATE_UNIT_BACKUP=""
ORIGINAL_UPDATE_UNIT_EXISTED=0
ORIGINAL_UPDATE_SUDOERS_BACKUP=""
ORIGINAL_UPDATE_SUDOERS_EXISTED=0
ORIGINAL_ENV_BACKUP=""
BUNDLED_ADDON=0
CUTOVER_STARTED=0
DEPLOYMENT_SUCCEEDED=0
DATA_BACKUP_COMPLETED=0
ADDON_BACKUP_COMPLETED=0
PARTIAL_CREATED=0
RELEASE_CREATED=0
RENDERED_UPDATER_CREATED=0
partial=""
release=""
old_target=""
backup_dir=""
addons_real=""
rendered_update_unit=""
rendered_update_sudoers=""
rendered_updater_dir=""
validation_update_unit=""
bundled_addon_archive=""
bundled_addon_metadata=""

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deployment/scripts/install-lib.sh
source "$SCRIPT_DIR/install-lib.sh"

log() { printf '[yeen-deploy] %s\n' "$*"; }
fail() { printf '[yeen-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

safe_release_id() {
  [[ "$1" =~ ^[A-Za-z0-9._-]{3,96}$ ]]
}

atomic_link() {
  local target="$1"
  local link="$2"
  local temp="${link}.new.$$"
  ln -s "$target" "$temp"
  mv -Tf "$temp" "$link"
}

cleanup_old_releases() {
  local current_target previous_target candidate resolved
  current_target="$(readlink -f "$ROOT/current")"
  previous_target="$(readlink -f "$ROOT/previous" 2>/dev/null || true)"

  while IFS= read -r -d '' candidate; do
    resolved="$(readlink -f "$candidate")"
    [[ "$resolved" == "$ROOT/releases/"* ]] || continue
    [[ "$resolved" != "$current_target" && "$resolved" != "$previous_target" ]] || continue
    rm -rf -- "$resolved" || log "WARNING: unable to remove old release $resolved."
  done < <(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -print0)
}

restore_optional_file() {
  local existed="$1"
  local backup="$2"
  local target="$3"
  if [[ "$existed" -eq 1 && -f "$backup" ]]; then
    cp "$backup" "$target"
  else
    rm -f "$target"
  fi
}

service_health() {
  local main_pid port discovered_port
  main_pid="$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || true)"
  port="4000"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$main_pid/environ" ]]; then
    discovered_port="$(tr '\0' '\n' <"/proc/$main_pid/environ" | sed -n 's/^PORT=//p' | tail -1)"
    if yeen_validate_port "$discovered_port"; then
      port="$discovered_port"
    fi
  fi
  systemctl is-active --quiet "$SERVICE" || return 1
  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$port/api/health" | grep -q '"status":"ok"' \
    || return 1
  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$port/" >/dev/null || return 1
  if [[ -f "$ROOT/current/apps/server/dist/transport/dual-protocol-server.js" ]]; then
    curl --insecure --fail --silent --show-error --max-time 5 \
      "https://127.0.0.1:$port/api/health" | grep -q '"status":"ok"' \
      || return 1
    curl --insecure --fail --silent --show-error --max-time 5 \
      "https://127.0.0.1:$port/" >/dev/null || return 1
  fi
  if [[ "$BUNDLED_ADDON" -eq 1 ]]; then
    "$NODE_BINARY" "$release/deployment/scripts/addon-deploy.mjs" verify \
      "$bundled_addon_metadata" "$addons_real" >/dev/null || return 1
  fi
}

runtime_data_exists() {
  [[ -n "$(find -L "$ROOT/shared/data" -mindepth 1 -maxdepth 1 \
    ! -name hls ! -name subtitles -print -quit 2>/dev/null)" ]]
}

restore_previous_release() {
  [[ "$CUTOVER_STARTED" -eq 1 && "$DEPLOYMENT_SUCCEEDED" -eq 0 ]] || return 0
  local rollback_ok=1
  log "Deployment failed after service stop; restoring pre-cutover code and state."
  systemctl stop "$SERVICE" || true
  if [[ "$DATA_BACKUP_COMPLETED" -eq 1 ]]; then
    if ! "$NODE_BINARY" "$release/deployment/scripts/production-data.mjs" \
      restore "$ROOT/shared/data" "$backup_dir"; then
      log "ERROR: authoritative runtime data restore failed; the old service will remain stopped."
      rollback_ok=0
    fi
  fi
  if [[ "$ADDON_BACKUP_COMPLETED" -eq 1 ]]; then
    if ! yeen_restore_directory_snapshot \
      "$addons_real" "$backup_dir/addons" "$backup_dir/failed-addons.$$"; then
      log "ERROR: add-on restore failed; the old service will remain stopped."
      rollback_ok=0
    fi
  fi
  if [[ -n "$ORIGINAL_ENV_BACKUP" && -f "$ORIGINAL_ENV_BACKUP" ]]; then
    cp "$ORIGINAL_ENV_BACKUP" "$ROOT/shared/yeen.env" || rollback_ok=0
    chown root:"$SERVICE_GROUP" "$ROOT/shared/yeen.env" || rollback_ok=0
    chmod 0640 "$ROOT/shared/yeen.env" || rollback_ok=0
  fi
  if [[ "$rollback_ok" -eq 1 ]]; then
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$data_real" "$addons_real" || rollback_ok=0
    chmod 0750 "$data_real" "$addons_real" || rollback_ok=0
  fi
  if [[ -n "$old_target" && -d "$old_target" ]]; then
    atomic_link "$old_target" "$ROOT/current"
  else
    rm -f "$ROOT/current"
  fi
  restore_optional_file "$ORIGINAL_UNIT_EXISTED" "$ORIGINAL_UNIT_BACKUP" "$UNIT_PATH"
  restore_optional_file \
    "$ORIGINAL_UPDATE_UNIT_EXISTED" "$ORIGINAL_UPDATE_UNIT_BACKUP" "$UPDATE_UNIT_PATH"
  restore_optional_file \
    "$ORIGINAL_UPDATE_SUDOERS_EXISTED" "$ORIGINAL_UPDATE_SUDOERS_BACKUP" "$UPDATE_SUDOERS_PATH"
  systemctl daemon-reload || true
  if [[ -n "$old_target" && "$rollback_ok" -eq 1 ]]; then
    if systemctl start "$SERVICE"; then
      log "Previous release and authoritative state were restored."
    else
      log "ERROR: previous release was restored but failed to restart."
      rollback_ok=0
    fi
  fi
  [[ "$rollback_ok" -eq 1 ]]
}

quarantine_failed_install_paths() {
  [[ "$DEPLOYMENT_SUCCEEDED" -eq 0 ]] || return 0
  if [[ "$PARTIAL_CREATED" -eq 1 && -n "$partial" && -d "$partial" ]]; then
    yeen_quarantine_failed_release_path \
      "$partial" "$ROOT/releases/${RELEASE_ID}.partial" \
      "$ROOT/incoming/${RELEASE_ID}.failed-partial.$$" \
      || log "ERROR: unable to quarantine failed partial release: $partial"
  fi
  if [[ "$RELEASE_CREATED" -eq 1 && -n "$release" && -d "$release" ]]; then
    yeen_quarantine_failed_release_path \
      "$release" "$ROOT/releases/$RELEASE_ID" \
      "$ROOT/incoming/${RELEASE_ID}.failed-release.$$" \
      || log "ERROR: unable to quarantine failed release: $release"
  fi
  if [[ "$RENDERED_UPDATER_CREATED" -eq 1 \
    && -n "$rendered_updater_dir" && -d "$rendered_updater_dir" ]]; then
    yeen_quarantine_failed_release_path \
      "$rendered_updater_dir" "$ROOT/incoming/${RELEASE_ID}.updater" \
      "$ROOT/incoming/${RELEASE_ID}.failed-updater.$$" \
      || log "ERROR: unable to quarantine failed rendered updater assets."
  fi
}

cleanup() {
  local exit_status=$?
  trap - EXIT
  restore_previous_release || exit_status=1
  quarantine_failed_install_paths
  exit "$exit_status"
}

trap cleanup EXIT

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Run this release installer as root."

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another Yeen deployment is running."

if [[ "$ROLLBACK_MODE" == "--rollback" ]]; then
  [[ -L "$ROOT/previous" ]] || fail "No previous release is available."
  old_target="$(readlink -f "$ROOT/current")"
  previous_target="$(readlink -f "$ROOT/previous")"
  [[ "$previous_target" == "$ROOT/releases/"* || "$previous_target" == "$LEGACY_ROOT" ]] \
    || fail "Previous pointer is not an approved Yeen release."
  systemctl stop "$SERVICE"
  atomic_link "$previous_target" "$ROOT/current"
  atomic_link "$old_target" "$ROOT/previous"
  systemctl start "$SERVICE"
  for _ in {1..20}; do
    service_health && { log "Rollback verified."; exit 0; }
    sleep 2
  done
  fail "Rollback service health verification failed."
fi

safe_release_id "$RELEASE_ID" || fail "Invalid release ID."
[[ "$UPDATE_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
  || fail "YEEN_UPDATE_REPOSITORY must use OWNER/REPO syntax."
[[ "$UPDATE_CHANNEL" == "stable" || "$UPDATE_CHANNEL" == "prerelease" ]] \
  || fail "YEEN_UPDATE_CHANNEL must be stable or prerelease."
[[ "$UPDATE_MAX_ARCHIVE_BYTES" =~ ^[1-9][0-9]{5,11}$ ]] \
  || fail "YEEN_UPDATE_MAX_ARCHIVE_BYTES is invalid."
yeen_validate_install_root "$ROOT" \
  || fail "Deployment root must be an absolute path with at least two safe components."
yeen_validate_install_root "$LEGACY_ROOT" \
  || fail "Legacy root must be an absolute path with at least two safe components."
[[ "$SERVICE" =~ ^[A-Za-z0-9_.@-]+$ ]] || fail "Invalid systemd service name."
[[ "$SERVICE_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Invalid service user."
[[ "$SERVICE_GROUP" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Invalid service group."
[[ -f "$ARCHIVE_PATH" ]] || fail "Release archive not found."
[[ "$EXPECTED_SHA" =~ ^[a-fA-F0-9]{64}$ ]] || fail "Invalid SHA-256."
actual_sha="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
[[ "${actual_sha,,}" == "${EXPECTED_SHA,,}" ]] || fail "Archive checksum mismatch."

for command in unzip flock curl find install sha256sum systemctl systemd-analyze sudo visudo; do
  command -v "$command" >/dev/null || fail "Missing required command: $command"
done
NODE_BINARY="${YEEN_NODE_BINARY:-$(command -v node)}"
NPM_BINARY="${YEEN_NPM_BINARY:-$(command -v npm)}"
[[ "$NODE_BINARY" == /* && -x "$NODE_BINARY" ]] || fail "Node binary must resolve to an executable absolute path."
[[ "$NPM_BINARY" == /* && -x "$NPM_BINARY" ]] || fail "npm binary must resolve to an executable absolute path."
id "$SERVICE_USER" >/dev/null 2>&1 || fail "Service user does not exist: $SERVICE_USER"
getent group "$SERVICE_GROUP" >/dev/null 2>&1 || fail "Service group does not exist: $SERVICE_GROUP"

mkdir -p "$ROOT/releases" "$ROOT/incoming"
yeen_adopt_shared_layout "$ROOT" "$LEGACY_ROOT"
[[ -f "$ROOT/shared/yeen.env" ]] \
  || fail "Production environment is missing. Run deployment/scripts/install.sh for first setup."
yeen_validate_shared_targets "$ROOT" "$LEGACY_ROOT" \
  || fail "Shared state resolves outside the approved Yeen or legacy layout."

install -d -m 0750 "$ROOT/shared"
install -d -m 0700 "$ROOT/shared/backups"
install -d -m 0750 "$ROOT/shared/npm-cache"
install -d -o root -g "$SERVICE_GROUP" -m 0750 "$ROOT/shared/update-status"
chown root:"$SERVICE_GROUP" "$ROOT/shared"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$ROOT/shared/npm-cache"
data_real="$(readlink -f "$ROOT/shared/data")"
addons_real="$(readlink -f "$ROOT/shared/addons")"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$data_real" "$addons_real"
chmod 0750 "$data_real" "$addons_real"
chown root:"$SERVICE_GROUP" "$(readlink -f "$ROOT/shared/yeen.env")"
chmod 0640 "$(readlink -f "$ROOT/shared/yeen.env")"

partial="$ROOT/releases/${RELEASE_ID}.partial"
release="$ROOT/releases/$RELEASE_ID"
[[ ! -e "$partial" && ! -e "$release" ]] || fail "Release already exists."

archive_entries="$(unzip -Z1 "$ARCHIVE_PATH")"
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  [[ "$entry" != /* && "$entry" != *'..'* && "$entry" != *'\\'* ]] \
    || fail "Unsafe archive entry: $entry"
  case "$entry" in
    data|data/*|apps/server/data|apps/server/data/*|.env|*/.env|*.sqlite|*.sqlite-wal|*.sqlite-shm)
      fail "Archive contains forbidden runtime state: $entry" ;;
  esac
done <<<"$archive_entries"

log "Staging release $RELEASE_ID while production remains online."
mkdir "$partial"
PARTIAL_CREATED=1
unzip -q "$ARCHIVE_PATH" -d "$partial"
[[ -f "$partial/package.json" && -f "$partial/package-lock.json" ]] \
  || fail "Runtime manifest or lockfile missing."
[[ -f "$partial/apps/server/dist/main.js" && -f "$partial/apps/web/dist/index.html" ]] \
  || fail "Compiled application is incomplete."
[[ -f "$partial/deployment/scripts/production-data.mjs" ]] \
  || fail "Production data validator is missing."
[[ -f "$partial/deployment/systemd/yeen-update@.service" \
  && -f "$partial/deployment/systemd/yeen-update-sudoers" \
  && -f "$partial/deployment/updater/yeen-apply-staged-update.sh" \
  && -f "$partial/deployment/updater/root-release-fetch.mjs" ]] \
  || fail "Native updater integration assets are incomplete."
[[ -f "$partial/deployment/scripts/install-lib.sh" \
  && -f "$partial/deployment/scripts/install-release.sh" ]] \
  || fail "Release installer assets are incomplete."
chmod 0755 \
  "$partial/deployment/scripts/install-release.sh" \
  "$partial/deployment/updater/yeen-apply-staged-update.sh" \
  "$partial/deployment/updater/root-release-fetch.mjs"
bash -n \
  "$partial/deployment/scripts/install-release.sh" \
  "$partial/deployment/updater/yeen-apply-staged-update.sh"
"$NODE_BINARY" --check "$partial/deployment/updater/root-release-fetch.mjs"
ln -s "$ROOT/shared/data" "$partial/data"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$partial"
sudo -u "$SERVICE_USER" -- env \
  HOME="$ROOT/shared/npm-cache" \
  PATH="$(dirname "$NODE_BINARY"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  NPM_CONFIG_CACHE="$ROOT/shared/npm-cache" \
  "$NPM_BINARY" ci --prefix "$partial" --omit=dev --ignore-scripts --no-audit --no-fund
sudo -u "$SERVICE_USER" -- env \
  HOME="$ROOT/shared/npm-cache" \
  PATH="$(dirname "$NODE_BINARY"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  NPM_CONFIG_CACHE="$ROOT/shared/npm-cache" \
  "$NPM_BINARY" rebuild --prefix "$partial" better-sqlite3 bcrypt --no-audit --no-fund
sudo -u "$SERVICE_USER" -- env \
  HOME="$ROOT/shared/npm-cache" \
  PATH="$(dirname "$NODE_BINARY"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "$NODE_BINARY" -e \
    "const {createRequire}=require('node:module'); const r=createRequire(require('node:path').join(process.argv[1], 'package.json')); r('better-sqlite3'); r('bcrypt')" \
    "$partial"
chown -R root:root "$partial"
chmod -R go-w "$partial"
mv "$partial" "$release"
partial=""
PARTIAL_CREATED=0
RELEASE_CREATED=1

bundled_addon_archive="$release/deployment/addons/downloader.yeen-addon.zip"
bundled_addon_metadata="$release/deployment/addons/downloader-deploy.json"
if [[ -f "$bundled_addon_archive" && -f "$bundled_addon_metadata" ]]; then
  [[ -f "$release/deployment/scripts/addon-deploy.mjs" ]] \
    || fail "Bundled add-on deployment helper is missing."
  BUNDLED_ADDON=1
elif [[ -e "$bundled_addon_archive" || -e "$bundled_addon_metadata" ]]; then
  fail "Bundled add-on archive and metadata must be present together."
fi

if [[ -L "$ROOT/current" ]]; then
  old_target="$(readlink -f "$ROOT/current")"
elif [[ -f "$LEGACY_ROOT/apps/server/dist/src/main.js" || -f "$LEGACY_ROOT/apps/server/dist/main.js" ]]; then
  old_target="$LEGACY_ROOT"
fi

attempt_id="${RELEASE_ID}.$(date +%s)-$$"
backup_dir="$ROOT/shared/backups/${attempt_id}"
ORIGINAL_UNIT_BACKUP="$ROOT/shared/backups/${attempt_id}.previous-unit"
ORIGINAL_UPDATE_UNIT_BACKUP="$ROOT/shared/backups/${attempt_id}.previous-update-unit"
ORIGINAL_UPDATE_SUDOERS_BACKUP="$ROOT/shared/backups/${attempt_id}.previous-update-sudoers"
if [[ "$BUNDLED_ADDON" -eq 1 ]]; then
  mkdir -p "$backup_dir"
  chmod 0700 "$backup_dir"
  ORIGINAL_ENV_BACKUP="$ROOT/shared/backups/${attempt_id}.previous-env"
  cp "$ROOT/shared/yeen.env" "$ORIGINAL_ENV_BACKUP"
  chmod 0600 "$ORIGINAL_ENV_BACKUP"
fi
if [[ -f "$UNIT_PATH" ]]; then
  cp "$UNIT_PATH" "$ORIGINAL_UNIT_BACKUP"
  chmod 0600 "$ORIGINAL_UNIT_BACKUP"
  ORIGINAL_UNIT_EXISTED=1
fi
if [[ -f "$UPDATE_UNIT_PATH" ]]; then
  cp "$UPDATE_UNIT_PATH" "$ORIGINAL_UPDATE_UNIT_BACKUP"
  chmod 0600 "$ORIGINAL_UPDATE_UNIT_BACKUP"
  ORIGINAL_UPDATE_UNIT_EXISTED=1
fi
if [[ -f "$UPDATE_SUDOERS_PATH" ]]; then
  cp "$UPDATE_SUDOERS_PATH" "$ORIGINAL_UPDATE_SUDOERS_BACKUP"
  chmod 0600 "$ORIGINAL_UPDATE_SUDOERS_BACKUP"
  ORIGINAL_UPDATE_SUDOERS_EXISTED=1
fi

rendered_updater_dir="$ROOT/incoming/${RELEASE_ID}.updater"
[[ ! -e "$rendered_updater_dir" && ! -L "$rendered_updater_dir" ]] \
  || fail "Rendered updater staging path already exists."
RENDERED_UPDATER_CREATED=1
yeen_render_updater_assets \
  "$release" "$ROOT" "$LEGACY_ROOT" "$SERVICE" "$SERVICE_USER" "$SERVICE_GROUP" \
  "$UPDATE_REPOSITORY" "$UPDATE_CHANNEL" "$UPDATE_MAX_ARCHIVE_BYTES" \
  "$NODE_BINARY" "$NPM_BINARY" \
  "$rendered_updater_dir" \
  || fail "Unable to render native updater integration assets."
rendered_update_unit="$rendered_updater_dir/yeen-update@.service"
rendered_update_sudoers="$rendered_updater_dir/yeen-update-sudoers"
yeen_render_updater_validation_unit \
  "$rendered_update_unit" "$ROOT" "$release" "$rendered_updater_dir/verify"
validation_update_unit="$rendered_updater_dir/verify/yeen-update@.service"
systemd-analyze verify "$validation_update_unit"
visudo -cf "$rendered_update_sudoers"

has_runtime_data=0
if runtime_data_exists; then
  has_runtime_data=1
  log "Validating and backing up existing authoritative runtime data."
  "$NODE_BINARY" "$release/deployment/scripts/production-data.mjs" validate "$ROOT/shared/data"
fi

log "Stopping Yeen for atomic code cutover."
CUTOVER_STARTED=1
if systemctl is-active --quiet "$SERVICE"; then
  systemctl stop "$SERVICE"
fi

if [[ "$has_runtime_data" -eq 1 ]]; then
  "$NODE_BINARY" "$release/deployment/scripts/production-data.mjs" backup "$ROOT/shared/data" "$backup_dir"
  DATA_BACKUP_COMPLETED=1
fi
yeen_backup_directory_snapshot "$addons_real" "$backup_dir/addons"
ADDON_BACKUP_COMPLETED=1
if [[ "$BUNDLED_ADDON" -eq 1 ]]; then
  log "Staging the bundled Downloader Add-on for the coordinated restart."
  "$NODE_BINARY" "$release/deployment/scripts/addon-deploy.mjs" stage \
    "$release" "$bundled_addon_archive" "$bundled_addon_metadata" \
    "$addons_real" "$ROOT/shared/yeen.env"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$addons_real"
  chmod 0750 "$addons_real"
fi

if [[ -n "$old_target" ]]; then
  atomic_link "$old_target" "$ROOT/previous"
fi
atomic_link "$release" "$ROOT/current"

cat >"$UNIT_PATH" <<EOF
[Unit]
Description=Yeen Media Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT/current
ExecStart=$NODE_BINARY apps/server/dist/main.js
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
User=$SERVICE_USER
Group=$SERVICE_GROUP
Environment=NODE_ENV=production
Environment=YEEN_ADDONS_ROOT=$ROOT/shared/addons
Environment=YEEN_SUPERVISED_RESTART=true
Environment=YEEN_UPDATE_REPOSITORY=$UPDATE_REPOSITORY
Environment=YEEN_UPDATE_CHANNEL=$UPDATE_CHANNEL
Environment=YEEN_UPDATE_MAX_ARCHIVE_BYTES=$UPDATE_MAX_ARCHIVE_BYTES
Environment=YEEN_UPDATE_STATUS_ROOT=$ROOT/shared/update-status
Environment=YEEN_DEPLOYMENT_MODE=systemd
EnvironmentFile=$ROOT/shared/yeen.env

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$UNIT_PATH"
install -m 0644 "$rendered_update_unit" "${UPDATE_UNIT_PATH}.new.$$"
mv -Tf "${UPDATE_UNIT_PATH}.new.$$" "$UPDATE_UNIT_PATH"
install -m 0440 "$rendered_update_sudoers" "${UPDATE_SUDOERS_PATH}.new.$$"
mv -Tf "${UPDATE_SUDOERS_PATH}.new.$$" "$UPDATE_SUDOERS_PATH"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl start "$SERVICE"

for _ in {1..30}; do
  if service_health; then
    sleep 3
    if service_health; then
      DEPLOYMENT_SUCCEEDED=1
      cleanup_old_releases
      log "Release $RELEASE_ID verified. Runtime data remains at $ROOT/shared/data."
      exit 0
    fi
  fi
  sleep 2
done

fail "New release failed health verification; automatic code rollback will run."
