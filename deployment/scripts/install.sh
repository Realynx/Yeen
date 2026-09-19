#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deployment/scripts/install-lib.sh
source "$SCRIPT_DIR/install-lib.sh"

ARCHIVE_PATH=""
EXPECTED_SHA=""
RELEASE_ID=""
ROOT="${YEEN_DEPLOY_ROOT:-/opt/yeen}"
LEGACY_ROOT="${YEEN_LEGACY_ROOT:-/var/www/yeen}"
SERVICE="${YEEN_SERVICE_NAME:-yeen}"
SERVICE_USER="${YEEN_SERVICE_USER:-www-data}"
SERVICE_GROUP="${YEEN_SERVICE_GROUP:-www-data}"
PORT="${YEEN_PORT:-${PORT:-4000}}"
BASE_URL="${YEEN_BASE_URL:-}"
CORS_ORIGIN="${YEEN_CORS_ORIGIN:-${CORS_ORIGIN:-}}"
ADMIN_EMAIL="${YEEN_ADMIN_EMAIL:-${DEFAULT_ADMIN_EMAIL:-}}"
ADMIN_NAME="${YEEN_ADMIN_NAME:-${DEFAULT_ADMIN_NAME:-}}"
ADMIN_PASSWORD="${YEEN_ADMIN_PASSWORD:-${DEFAULT_ADMIN_PASSWORD:-}}"
ADMIN_PASSWORD_FILE="${YEEN_ADMIN_PASSWORD_FILE:-}"
MEDIA_LIBRARY="${YEEN_MEDIA_LIBRARY_PATH:-${MEDIA_LIBRARY_PATH:-/srv/media}}"
NON_INTERACTIVE="${YEEN_NON_INTERACTIVE:-0}"
INSTALL_DEPENDENCIES="${YEEN_INSTALL_DEPENDENCIES:-1}"
INSTALL_RELEASE_SCRIPT="${YEEN_INSTALL_RELEASE_SCRIPT:-$SCRIPT_DIR/install-release.sh}"
UPDATE_REPOSITORY="${YEEN_UPDATE_REPOSITORY:-Realynx/Yeen}"
UPDATE_CHANNEL="${YEEN_UPDATE_CHANNEL:-stable}"
UPDATE_MAX_ARCHIVE_BYTES="${YEEN_UPDATE_MAX_ARCHIVE_BYTES:-2147483648}"
TLS_HOSTNAME="${YEEN_TLS_HOSTNAME:-localhost}"
BOOTSTRAP_CREDENTIALS_PRESENT=0

log() { printf '[yeen-install] %s\n' "$*"; }
fail() { printf '[yeen-install] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: sudo bash install.sh --archive PATH --sha256 HEX --release-id ID [options]

Required release inputs:
  --archive PATH                 Verified Yeen release ZIP
  --sha256 HEX                   Expected SHA-256 for the ZIP
  --release-id ID                Release label (for example v1.2.3-abc123def456)

First-run configuration:
  --base-url ORIGIN              Browser origin, e.g. https://media.example.com
  --cors-origin ORIGINS          Explicit comma-separated trusted origins
  --port PORT                    Server port (default 4000)
  --admin-email EMAIL            Initial administrator email
  --admin-name NAME              Initial administrator display name
  --admin-password-file PATH     Restricted file containing initial password
  --media-library PATH           Initial media location (default /srv/media)
  --tls-hostname HOSTNAME       Name for the persistent self-signed certificate
  --non-interactive              Fail instead of prompting for missing values

Layout and platform:
  --deploy-root PATH             Release/shared root (default /opt/yeen)
  --legacy-root PATH             Legacy install to adopt (default /var/www/yeen)
  --service-name NAME            systemd service name (default yeen)
  --skip-dependency-install      Only validate required commands

Automation can use YEEN_ADMIN_PASSWORD instead of exposing a password in argv.
Existing data, accounts, settings, SQLite metadata, add-ons, and yeen.env are
adopted in place and are never replaced by this script.
EOF
}

while (($# > 0)); do
  case "$1" in
    --archive) ARCHIVE_PATH="${2:-}"; shift 2 ;;
    --sha256) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --cors-origin) CORS_ORIGIN="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:-}"; shift 2 ;;
    --admin-password-file) ADMIN_PASSWORD_FILE="${2:-}"; shift 2 ;;
    --media-library) MEDIA_LIBRARY="${2:-}"; shift 2 ;;
    --tls-hostname) TLS_HOSTNAME="${2:-}"; shift 2 ;;
    --deploy-root) ROOT="${2:-}"; shift 2 ;;
    --legacy-root) LEGACY_ROOT="${2:-}"; shift 2 ;;
    --service-name) SERVICE="${2:-}"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --skip-dependency-install) INSTALL_DEPENDENCIES=0; shift ;;
    --help|-h) usage; exit 0 ;;
    --) shift ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Run this installer as root."
[[ -n "$ARCHIVE_PATH" && -f "$ARCHIVE_PATH" ]] || fail "--archive must name an existing ZIP."
[[ "$EXPECTED_SHA" =~ ^[a-fA-F0-9]{64}$ ]] || fail "--sha256 must be 64 hexadecimal characters."
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{3,96}$ ]] || fail "--release-id is invalid."
[[ "$UPDATE_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
  || fail "YEEN_UPDATE_REPOSITORY must use OWNER/REPO syntax."
[[ "$UPDATE_CHANNEL" == "stable" || "$UPDATE_CHANNEL" == "prerelease" ]] \
  || fail "YEEN_UPDATE_CHANNEL must be stable or prerelease."
[[ "$UPDATE_MAX_ARCHIVE_BYTES" =~ ^[1-9][0-9]{5,11}$ ]] \
  || fail "YEEN_UPDATE_MAX_ARCHIVE_BYTES is invalid."
yeen_validate_port "$PORT" || fail "Port must be between 1 and 65535."
yeen_validate_tls_hostname "$TLS_HOSTNAME" || fail "TLS hostname is invalid."
yeen_validate_install_root "$ROOT" \
  || fail "Deployment root must be an absolute path with at least two safe components."
yeen_validate_install_root "$LEGACY_ROOT" \
  || fail "Legacy root must be an absolute path with at least two safe components."

install_system_dependencies() {
  local missing=()
  local command
  for command in curl unzip flock openssl sha256sum tar xz ffmpeg ffprobe systemctl systemd-analyze sudo visudo; do
    command -v "$command" >/dev/null || missing+=("$command")
  done
  ((${#missing[@]} > 0)) || return 0
  [[ "$INSTALL_DEPENDENCIES" -eq 1 ]] \
    || fail "Missing required commands: ${missing[*]}"

  if command -v apt-get >/dev/null; then
    log "Installing available runtime packages with apt."
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
      ca-certificates curl unzip util-linux openssl xz-utils ffmpeg sudo
  elif command -v dnf >/dev/null; then
    log "Installing available runtime packages with dnf."
    dnf install -y ca-certificates curl unzip util-linux openssl xz ffmpeg sudo
  else
    fail "Install missing commands manually: ${missing[*]} (supported package managers: apt, dnf)."
  fi

  for command in curl unzip flock openssl sha256sum tar xz ffmpeg ffprobe systemctl systemd-analyze sudo visudo; do
    command -v "$command" >/dev/null || fail "Required command is still missing: $command"
  done
}

install_system_dependencies

ensure_node_runtime() {
  local node_major='0'
  if command -v node >/dev/null && command -v npm >/dev/null; then
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
  fi
  if [[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 22 ]]; then
    export YEEN_NODE_BINARY="$(command -v node)"
    export YEEN_NPM_BINARY="$(command -v npm)"
    return 0
  fi

  local archive_arch manifest_path archive_file archive_sha archive_path runtime_root version_dir
  archive_arch="$(yeen_node_archive_arch "$(uname -m)")" \
    || fail "Automatic Node 22 setup supports only x64 and arm64 Linux hosts."
  runtime_root="$ROOT/shared/runtime"
  mkdir -p "$ROOT/incoming" "$runtime_root"
  manifest_path="$ROOT/incoming/node-v22-SHASUMS256.txt"
  log "Installing an official checksum-verified Node.js 22 runtime for $archive_arch."
  curl --fail --silent --show-error --location \
    https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$manifest_path"
  archive_file="$(awk -v arch="$archive_arch" \
    '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") { print $2; exit }' \
    "$manifest_path")"
  [[ -n "$archive_file" ]] || fail "Official Node 22 manifest did not contain a $archive_arch Linux archive."
  archive_sha="$(awk -v file="$archive_file" '$2 == file { print $1; exit }' "$manifest_path")"
  [[ "$archive_sha" =~ ^[a-f0-9]{64}$ ]] || fail "Official Node 22 checksum was invalid."
  archive_path="$ROOT/incoming/$archive_file"
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/latest-v22.x/$archive_file" -o "$archive_path"
  printf '%s  %s\n' "$archive_sha" "$archive_path" | sha256sum --check --status \
    || fail "Official Node 22 archive checksum verification failed."

  version_dir="$runtime_root/${archive_file%.tar.xz}"
  if [[ ! -d "$version_dir" ]]; then
    tar -xJf "$archive_path" -C "$runtime_root" --no-same-owner
  fi
  [[ -x "$version_dir/bin/node" && -x "$version_dir/bin/npm" ]] \
    || fail "Installed Node 22 runtime is incomplete."
  ln -s "$version_dir" "$runtime_root/node-current.new.$$"
  mv -Tf "$runtime_root/node-current.new.$$" "$runtime_root/node-current"
  export PATH="$runtime_root/node-current/bin:$PATH"
  export YEEN_NODE_BINARY="$runtime_root/node-current/bin/node"
  export YEEN_NPM_BINARY="$runtime_root/node-current/bin/npm"
}

ensure_node_runtime

if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
  groupadd --system "$SERVICE_GROUP"
fi
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --gid "$SERVICE_GROUP" --home-dir /nonexistent \
    --shell /usr/sbin/nologin "$SERVICE_USER"
fi

export YEEN_DEPLOY_ROOT="$ROOT"
export YEEN_LEGACY_ROOT="$LEGACY_ROOT"
export YEEN_SERVICE_NAME="$SERVICE"
export YEEN_SERVICE_USER="$SERVICE_USER"
export YEEN_SERVICE_GROUP="$SERVICE_GROUP"

yeen_adopt_shared_layout "$ROOT" "$LEGACY_ROOT"
data_path="$ROOT/shared/data"
env_path="$ROOT/shared/yeen.env"
if [[ -e "$env_path" ]]; then
  yeen_validate_shared_targets "$ROOT" "$LEGACY_ROOT" 1 \
    || fail "Shared state resolves outside the approved Yeen or legacy layout."
else
  yeen_validate_shared_targets "$ROOT" "$LEGACY_ROOT" 0 \
    || fail "Shared state resolves outside the approved Yeen or legacy layout."
fi

set +e
yeen_accounts_state "$data_path"
accounts_status=$?
set -e
case "$accounts_status" in
  0) accounts_exist=1 ;;
  1) accounts_exist=0 ;;
  *) fail "Existing accounts.json is not a valid account array; refusing to seed or overwrite it." ;;
esac

prompt_value() {
  local variable_name="$1"
  local label="$2"
  local default_value="${3:-}"
  local current_value="${!variable_name}"
  [[ -n "$current_value" ]] && return 0
  [[ "$NON_INTERACTIVE" -eq 0 ]] || fail "$label is required in non-interactive mode."
  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " current_value
    current_value="${current_value:-$default_value}"
  else
    read -r -p "$label: " current_value
  fi
  printf -v "$variable_name" '%s' "$current_value"
}

read_initial_password() {
  local confirmation
  if [[ -n "$ADMIN_PASSWORD_FILE" ]]; then
    yeen_validate_secret_file "$ADMIN_PASSWORD_FILE" "${EUID:-$(id -u)}" \
      || fail "Administrator password file must be a regular non-symlink, owned by the installer, with mode 0600 or stricter."
    IFS= read -r ADMIN_PASSWORD <"$ADMIN_PASSWORD_FILE" || true
  fi
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    [[ "$NON_INTERACTIVE" -eq 0 ]] \
      || fail "YEEN_ADMIN_PASSWORD or --admin-password-file is required for first setup."
    read -r -s -p "Initial administrator password: " ADMIN_PASSWORD
    printf '\n'
    read -r -s -p "Confirm administrator password: " confirmation
    printf '\n'
    [[ "$ADMIN_PASSWORD" == "$confirmation" ]] || fail "Administrator passwords did not match."
  fi
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] \
    || fail "Initial administrator password must be at least 12 characters."
  [[ "$ADMIN_PASSWORD" != *$'\n'* && "$ADMIN_PASSWORD" != *$'\r'* ]] \
    || fail "Administrator password cannot contain a newline."
}

if [[ ! -e "$env_path" ]]; then
  prompt_value BASE_URL "Public Yeen origin" "http://localhost:$PORT"
  [[ -n "$CORS_ORIGIN" ]] || CORS_ORIGIN="$BASE_URL"
  IFS=',' read -r -a cors_origins <<<"$CORS_ORIGIN"
  for origin in "${cors_origins[@]}"; do
    origin="${origin#${origin%%[![:space:]]*}}"
    origin="${origin%${origin##*[![:space:]]}}"
    yeen_validate_origin "$origin" || fail "Invalid trusted origin: $origin"
  done
  yeen_validate_origin "$BASE_URL" || fail "Invalid public Yeen origin: $BASE_URL"

  if [[ "$accounts_exist" -eq 0 ]]; then
    prompt_value ADMIN_EMAIL "Initial administrator email"
    prompt_value ADMIN_NAME "Initial administrator display name" "Yeen Admin"
    yeen_validate_email "$ADMIN_EMAIL" || fail "Initial administrator email is invalid."
    [[ -n "${ADMIN_NAME//[[:space:]]/}" ]] || fail "Administrator display name cannot be empty."
    read_initial_password
    BOOTSTRAP_CREDENTIALS_PRESENT=1
  fi

  jwt_secret="$(openssl rand -hex 48)"
  yeen_write_initial_env "$env_path" "$PORT" "$CORS_ORIGIN" "$BASE_URL" \
    "$jwt_secret" "$ADMIN_EMAIL" "$ADMIN_NAME" "$ADMIN_PASSWORD" \
    "$MEDIA_LIBRARY" "$ROOT/shared/addons"
  log "Created a restricted production environment with a generated JWT secret."
elif [[ "$accounts_exist" -eq 0 ]]; then
  if yeen_env_has_bootstrap_credentials "$env_path"; then
    BOOTSTRAP_CREDENTIALS_PRESENT=1
    log "Using one-time administrator bootstrap values already present in the adopted environment."
  else
    prompt_value ADMIN_EMAIL "Initial administrator email"
    prompt_value ADMIN_NAME "Initial administrator display name" "Yeen Admin"
    yeen_validate_email "$ADMIN_EMAIL" || fail "Initial administrator email is invalid."
    read_initial_password
    yeen_append_bootstrap_credentials "$env_path" "$ADMIN_EMAIL" "$ADMIN_NAME" "$ADMIN_PASSWORD"
    BOOTSTRAP_CREDENTIALS_PRESENT=1
    log "Added one-time administrator bootstrap values without replacing the adopted environment."
  fi
else
  log "Existing accounts detected; administrator seeding and password changes are skipped."
  if grep -Eq '^DEFAULT_ADMIN_(EMAIL|NAME|PASSWORD)=' "$env_path"; then
    yeen_remove_env_keys "$env_path" \
      DEFAULT_ADMIN_EMAIL DEFAULT_ADMIN_NAME DEFAULT_ADMIN_PASSWORD
    log "Removed stale plaintext administrator bootstrap values from the adopted environment."
  fi
fi

tls_cert_path="$ROOT/shared/tls/yeen.crt"
tls_key_path="$ROOT/shared/tls/yeen.key"
yeen_ensure_self_signed_tls "$ROOT" "$SERVICE_GROUP" "$TLS_HOSTNAME" \
  || fail "Unable to provision the persistent self-signed TLS certificate."
yeen_append_env_default "$env_path" YEEN_TLS_CERT_PATH "$tls_cert_path"
yeen_append_env_default "$env_path" YEEN_TLS_KEY_PATH "$tls_key_path"
log "Persistent same-port HTTPS certificate is ready for $TLS_HOSTNAME."

yeen_append_env_default "$env_path" YEEN_UPDATE_REPOSITORY "$UPDATE_REPOSITORY"
yeen_append_env_default "$env_path" YEEN_UPDATE_CHANNEL "$UPDATE_CHANNEL"
yeen_append_env_default "$env_path" YEEN_UPDATE_MAX_ARCHIVE_BYTES "$UPDATE_MAX_ARCHIVE_BYTES"
yeen_append_env_default "$env_path" YEEN_DEPLOYMENT_MODE systemd
yeen_validate_shared_targets "$ROOT" "$LEGACY_ROOT" \
  || fail "Shared state resolves outside the approved Yeen or legacy layout."

# From this point the one-time secret lives only in the restricted EnvironmentFile
# until account creation is verified; do not leak it to npm, Node, or deploy helpers.
ADMIN_PASSWORD=''
unset YEEN_ADMIN_PASSWORD DEFAULT_ADMIN_PASSWORD

chown root:"$SERVICE_GROUP" "$(readlink -f "$env_path")"
chmod 0640 "$(readlink -f "$env_path")"

actual_sha="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
[[ "${actual_sha,,}" == "${EXPECTED_SHA,,}" ]] || fail "Release archive checksum mismatch."

log "Installing release $RELEASE_ID."
bash "$INSTALL_RELEASE_SCRIPT" "$RELEASE_ID" "$ARCHIVE_PATH" "$EXPECTED_SHA"

verify_local_health() {
  local health_port="$PORT"
  local main_pid discovered_port
  main_pid="$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || true)"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$main_pid/environ" ]]; then
    discovered_port="$(tr '\0' '\n' <"/proc/$main_pid/environ" | sed -n 's/^PORT=//p' | tail -1)"
    if yeen_validate_port "$discovered_port"; then
      health_port="$discovered_port"
    fi
  fi
  systemctl is-active --quiet "$SERVICE" \
    && curl --fail --silent --show-error --max-time 5 \
      "http://127.0.0.1:$health_port/api/health" | grep -q '"status":"ok"'
}

if [[ "$BOOTSTRAP_CREDENTIALS_PRESENT" -eq 1 ]]; then
  set +e
  yeen_accounts_state "$data_path"
  seeded_status=$?
  set -e
  [[ "$seeded_status" -eq 0 ]] \
    || fail "Release is healthy, but the initial administrator account was not persisted. Bootstrap values were retained for retry."

  yeen_remove_env_keys "$env_path" \
    DEFAULT_ADMIN_EMAIL DEFAULT_ADMIN_NAME DEFAULT_ADMIN_PASSWORD
  ADMIN_PASSWORD=''
  unset YEEN_ADMIN_PASSWORD DEFAULT_ADMIN_PASSWORD
  systemctl restart "$SERVICE"
  for _ in {1..20}; do
    verify_local_health && break
    sleep 2
  done
  verify_local_health \
    || fail "Administrator was created and plaintext bootstrap values were removed, but the clean restart failed."
  log "Initial administrator created; plaintext bootstrap credentials were removed and the clean restart was verified."
fi

systemctl enable "$SERVICE"
log "Yeen is installed at $ROOT/current and enabled as $SERVICE.service."
log "Open ${BASE_URL:-your configured Yeen origin} and sign in with the administrator account."
