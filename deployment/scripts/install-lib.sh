#!/usr/bin/env bash

# Shared, side-effect-limited helpers for the interactive installer and its
# shell-level fixture tests. Callers are expected to enable strict mode.

yeen_fail() {
  printf '[yeen-install] ERROR: %s\n' "$*" >&2
  return 1
}

yeen_validate_port() {
  [[ "$1" =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$1 <= 65535))
}

yeen_validate_origin() {
  [[ "$1" =~ ^https?://[^/[:space:]]+(:[0-9]{1,5})?$ ]]
}

yeen_validate_tls_hostname() {
  local hostname="$1"
  [[ ${#hostname} -le 253 \
    && "$hostname" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ \
    && "$hostname" != *'..'* ]]
}

yeen_validate_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

yeen_validate_install_root() {
  local candidate="$1"
  [[ "$candidate" =~ ^/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] \
    && [[ "$candidate" != *'/./'* && "$candidate" != *'/../'* ]] \
    && [[ "$candidate" != */. && "$candidate" != */.. ]]
}

yeen_node_archive_arch() {
  case "$1" in
    x86_64|amd64) printf 'x64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *) return 1 ;;
  esac
}

yeen_validate_secret_file() {
  local file_path="$1"
  local expected_owner_uid="$2"
  local file_mode file_owner
  [[ -f "$file_path" && ! -L "$file_path" ]] || return 1
  file_mode="$(stat -c '%a' "$file_path")" || return 1
  file_owner="$(stat -c '%u' "$file_path")" || return 1
  (( (8#$file_mode & 077) == 0 )) || return 1
  [[ "$file_owner" -eq "$expected_owner_uid" ]]
}

yeen_env_quote() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

yeen_accounts_state() {
  local data_dir="$1"
  local accounts_path="$data_dir/accounts.json"
  [[ -e "$accounts_path" ]] || return 1

  node - "$accounts_path" <<'NODE'
const fs = require('node:fs');
const path = process.argv[2];
try {
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!Array.isArray(value)) process.exit(2);
  process.exit(value.length > 0 ? 0 : 1);
} catch {
  process.exit(2);
}
NODE
}

yeen_adopt_shared_layout() {
  local root="$1"
  local legacy_root="$2"
  local shared="$root/shared"

  mkdir -p "$shared"

  if [[ -L "$shared/data" && ! -e "$shared/data" ]]; then
    yeen_fail "Shared data link is broken: $shared/data"
    return 1
  fi
  if [[ ! -e "$shared/data" ]]; then
    if [[ -d "$legacy_root/data" ]]; then
      ln -s "$legacy_root/data" "$shared/data"
    else
      mkdir -p "$shared/data"
    fi
  fi

  if [[ -L "$shared/yeen.env" && ! -e "$shared/yeen.env" ]]; then
    yeen_fail "Shared environment link is broken: $shared/yeen.env"
    return 1
  fi
  if [[ ! -e "$shared/yeen.env" && -f "$legacy_root/.env" ]]; then
    ln -s "$legacy_root/.env" "$shared/yeen.env"
  fi

  if [[ -L "$shared/addons" && ! -e "$shared/addons" ]]; then
    yeen_fail "Shared add-on link is broken: $shared/addons"
    return 1
  fi
  if [[ ! -e "$shared/addons" ]]; then
    if [[ -d "$shared/data/addons" ]]; then
      ln -s "$shared/data/addons" "$shared/addons"
    else
      mkdir -p "$shared/addons"
    fi
  fi

  [[ -d "$shared/data" ]] || {
    yeen_fail "Shared data path is not a directory: $shared/data"
    return 1
  }
  [[ -d "$shared/addons" ]] || {
    yeen_fail "Shared add-on path is not a directory: $shared/addons"
    return 1
  }

  mkdir -p "$shared/backups" "$shared/npm-cache"
}

yeen_ensure_self_signed_tls() {
  local root="$1"
  local service_group="$2"
  local tls_hostname="$3"
  local tls_dir="$root/shared/tls"
  local cert_path="$tls_dir/yeen.crt"
  local key_path="$tls_dir/yeen.key"
  local temp_cert="$tls_dir/.yeen.crt.new.$$"
  local temp_key="$tls_dir/.yeen.key.new.$$"
  local cert_public_key key_public_key

  yeen_validate_install_root "$root" || return 1
  [[ "$service_group" =~ ^[A-Za-z0-9_.-]+$ ]] || return 1
  yeen_validate_tls_hostname "$tls_hostname" || return 1
  install -d -m 0750 "$tls_dir"
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    chown root:"$service_group" "$tls_dir"
  fi

  if [[ -e "$cert_path" || -e "$key_path" ]]; then
    [[ -f "$cert_path" && ! -L "$cert_path" \
      && -f "$key_path" && ! -L "$key_path" ]] || {
      yeen_fail "Managed TLS certificate and key must both be regular files."
      return 1
    }
  else
    rm -f "$temp_cert" "$temp_key"
    if ! openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
      -keyout "$temp_key" -out "$temp_cert" \
      -subj "/CN=$tls_hostname" \
      -addext "subjectAltName=DNS:$tls_hostname,DNS:localhost,IP:127.0.0.1" \
      >/dev/null 2>&1; then
      rm -f "$temp_cert" "$temp_key"
      return 1
    fi
    if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      chown root:"$service_group" "$temp_cert" "$temp_key"
    fi
    chmod 0644 "$temp_cert"
    chmod 0640 "$temp_key"
    mv "$temp_cert" "$cert_path"
    mv "$temp_key" "$key_path"
  fi

  openssl x509 -in "$cert_path" -noout -checkend 0 >/dev/null 2>&1 || {
    yeen_fail "Managed TLS certificate is expired or invalid."
    return 1
  }
  openssl x509 -in "$cert_path" -noout -checkhost "$tls_hostname" \
    | grep -q 'does match certificate' || {
    yeen_fail "Managed TLS certificate does not cover $tls_hostname."
    return 1
  }
  cert_public_key="$(openssl x509 -in "$cert_path" -pubkey -noout 2>/dev/null \
    | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  key_public_key="$(openssl pkey -in "$key_path" -pubout -outform DER 2>/dev/null \
    | sha256sum | awk '{print $1}')"
  [[ -n "$cert_public_key" && "$cert_public_key" == "$key_public_key" ]] || {
    yeen_fail "Managed TLS certificate does not match its private key."
    return 1
  }

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    chown root:"$service_group" "$cert_path" "$key_path"
  fi
  chmod 0644 "$cert_path"
  chmod 0640 "$key_path"
}

yeen_validate_shared_targets() {
  local root="$1"
  local legacy_root="$2"
  local require_env="${3:-1}"
  local data_real addons_real env_real
  data_real="$(readlink -f "$root/shared/data")" || return 1
  addons_real="$(readlink -f "$root/shared/addons")" || return 1

  [[ "$data_real" == "$root/shared/data" || "$data_real" == "$legacy_root/data" ]] \
    || return 1
  [[ "$addons_real" == "$root/shared/addons" \
    || "$addons_real" == "$root/shared/data/addons" \
    || "$addons_real" == "$legacy_root/data/addons" ]] || return 1

  if [[ "$require_env" -eq 1 ]]; then
    env_real="$(readlink -f "$root/shared/yeen.env")" || return 1
    [[ "$env_real" == "$root/shared/yeen.env" || "$env_real" == "$legacy_root/.env" ]] \
      || return 1
  fi
}

yeen_backup_directory_snapshot() {
  local source_dir="$1"
  local backup_dir="$2"
  [[ "$source_dir" == /*/* && "$source_dir" != / && -d "$source_dir" && ! -L "$source_dir" ]] \
    || return 1
  [[ "$backup_dir" == /*/* && "$backup_dir" != / && ! -e "$backup_dir" && ! -L "$backup_dir" ]] \
    || return 1
  mkdir -p "$(dirname "$backup_dir")"
  mkdir "$backup_dir"
  chmod 0700 "$backup_dir"
  cp -a "$source_dir/." "$backup_dir/"
}

yeen_restore_directory_snapshot() {
  local source_dir="$1"
  local backup_dir="$2"
  local quarantine_dir="$3"
  local staged_dir="${source_dir}.restore.$$"
  [[ "$source_dir" == /*/* && "$source_dir" != / && -d "$source_dir" && ! -L "$source_dir" ]] \
    || return 1
  [[ "$backup_dir" == /*/* && "$backup_dir" != / && -d "$backup_dir" && ! -L "$backup_dir" ]] \
    || return 1
  [[ "$quarantine_dir" == /*/* && "$quarantine_dir" != / \
    && ! -e "$quarantine_dir" && ! -L "$quarantine_dir" ]] || return 1
  [[ ! -e "$staged_dir" && ! -L "$staged_dir" ]] || return 1

  mkdir "$staged_dir"
  chmod 0750 "$staged_dir"
  if ! cp -a "$backup_dir/." "$staged_dir/"; then
    rmdir "$staged_dir" 2>/dev/null || true
    return 1
  fi
  mkdir -p "$(dirname "$quarantine_dir")"
  mv "$source_dir" "$quarantine_dir"
  mv "$staged_dir" "$source_dir"
}

yeen_quarantine_failed_release_path() {
  local candidate="$1"
  local expected="$2"
  local quarantine="$3"
  [[ "$candidate" == "$expected" && "$candidate" == /*/* && "$candidate" != / \
    && -d "$candidate" && ! -L "$candidate" ]] || return 1
  [[ "$quarantine" == /*/* && "$quarantine" != / \
    && ! -e "$quarantine" && ! -L "$quarantine" ]] || return 1
  mkdir -p "$(dirname "$quarantine")"
  mv "$candidate" "$quarantine"
}

yeen_render_updater_assets() {
  local release_root="$1"
  local deploy_root="$2"
  local legacy_root="$3"
  local service_name="$4"
  local service_user="$5"
  local service_group="$6"
  local update_repository="$7"
  local update_channel="$8"
  local update_max_archive_bytes="$9"
  local node_binary="${10}"
  local npm_binary="${11}"
  local output_dir="${12}"
  local unit_source="$release_root/deployment/systemd/yeen-update@.service"
  local sudoers_source="$release_root/deployment/systemd/yeen-update-sudoers"
  local helper_source="$release_root/deployment/updater/yeen-apply-staged-update.sh"

  [[ -f "$unit_source" && -f "$sudoers_source" && -f "$helper_source" ]] \
    || return 1
  bash -n "$helper_source" || return 1
  mkdir "$output_dir"
  sed "s|/opt/yeen|$deploy_root|g" "$unit_source" \
    | awk \
      -v deploy_root="$deploy_root" \
      -v legacy_root="$legacy_root" \
      -v service_name="$service_name" \
      -v service_user="$service_user" \
      -v service_group="$service_group" \
      -v update_repository="$update_repository" \
      -v update_channel="$update_channel" \
      -v update_max_archive_bytes="$update_max_archive_bytes" \
      -v node_binary="$node_binary" \
      -v npm_binary="$npm_binary" '
        /^ExecStart=/ {
          print "Environment=YEEN_DEPLOY_ROOT=" deploy_root
          print "Environment=YEEN_LEGACY_ROOT=" legacy_root
          print "Environment=YEEN_SERVICE_NAME=" service_name
          print "Environment=YEEN_SERVICE_USER=" service_user
          print "Environment=YEEN_SERVICE_GROUP=" service_group
          print "Environment=YEEN_UPDATE_REPOSITORY=" update_repository
          print "Environment=YEEN_UPDATE_CHANNEL=" update_channel
          print "Environment=YEEN_UPDATE_MAX_ARCHIVE_BYTES=" update_max_archive_bytes
          print "Environment=YEEN_UPDATE_STATUS_ROOT=" deploy_root "/shared/update-status"
          print "Environment=YEEN_NODE_BINARY=" node_binary
          print "Environment=YEEN_NPM_BINARY=" npm_binary
          print "Environment=PATH=" substr(node_binary, 1, length(node_binary) - length("/node")) ":/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        }
        { print }
      ' >"$output_dir/yeen-update@.service"
  sed "s/^www-data /$service_user /" "$sudoers_source" \
    >"$output_dir/yeen-update-sudoers"
  chmod 0644 "$output_dir/yeen-update@.service"
  chmod 0440 "$output_dir/yeen-update-sudoers"
}

yeen_render_updater_validation_unit() {
  local rendered_unit="$1"
  local deploy_root="$2"
  local release_root="$3"
  local output_dir="$4"
  mkdir "$output_dir"
  sed "s|$deploy_root/current|$release_root|g" "$rendered_unit" \
    >"$output_dir/yeen-update@.service"
  chmod 0644 "$output_dir/yeen-update@.service"
}

yeen_write_initial_env() {
  local env_path="$1"
  local port="$2"
  local cors_origin="$3"
  local base_url="$4"
  local jwt_secret="$5"
  local admin_email="$6"
  local admin_name="$7"
  local admin_password="$8"
  local media_library="$9"
  local addons_root="${10}"
  local update_repository="${YEEN_UPDATE_REPOSITORY:-Realynx/Yeen}"
  local update_channel="${YEEN_UPDATE_CHANNEL:-stable}"
  local update_max_archive_bytes="${YEEN_UPDATE_MAX_ARCHIVE_BYTES:-2147483648}"
  local temp_path="${env_path}.new.$$"

  [[ ! -e "$env_path" && ! -L "$env_path" ]] || {
    yeen_fail "Refusing to overwrite existing environment: $env_path"
    return 1
  }

  (
    umask 0077
    {
      printf 'PORT=%s\n' "$port"
      printf 'CORS_ORIGIN=%s\n' "$(yeen_env_quote "$cors_origin")"
      printf 'YEEN_BASE_URL=%s\n' "$(yeen_env_quote "$base_url")"
      printf 'JWT_SECRET=%s\n' "$(yeen_env_quote "$jwt_secret")"
      if [[ -n "$admin_email" ]]; then
        printf 'DEFAULT_ADMIN_EMAIL=%s\n' "$(yeen_env_quote "$admin_email")"
        printf 'DEFAULT_ADMIN_NAME=%s\n' "$(yeen_env_quote "$admin_name")"
        printf 'DEFAULT_ADMIN_PASSWORD=%s\n' "$(yeen_env_quote "$admin_password")"
      fi
      printf 'MEDIA_LIBRARY_PATH=%s\n' "$(yeen_env_quote "$media_library")"
      printf 'MEDIA_LIBRARY_PATHS=%s\n' "$(yeen_env_quote "$media_library")"
      printf 'FFMPEG_PATH=ffmpeg\n'
      printf 'FFPROBE_PATH=ffprobe\n'
      printf 'OPENSUBTITLES_API_KEY=\n'
      printf 'TRANSCODE_PRESET=veryfast\n'
      printf 'TRANSCODE_CRF=22\n'
      printf 'HLS_SEGMENT_SECONDS=4\n'
      printf 'SUBTITLE_DEFAULT_LANGUAGE=en\n'
      printf 'TV_APK_FILE_PATH=\n'
      printf 'YEEN_ADDONS_ROOT=%s\n' "$(yeen_env_quote "$addons_root")"
      printf 'YEEN_ADDON_TRUSTED_KEYS={}\n'
      printf 'YEEN_SUPERVISED_RESTART=true\n'
      printf 'YEEN_UPDATE_REPOSITORY=%s\n' "$(yeen_env_quote "$update_repository")"
      printf 'YEEN_UPDATE_CHANNEL=%s\n' "$(yeen_env_quote "$update_channel")"
      printf 'YEEN_UPDATE_MAX_ARCHIVE_BYTES=%s\n' "$update_max_archive_bytes"
      printf 'YEEN_DEPLOYMENT_MODE=systemd\n'
    } >"$temp_path"
  )
  chmod 0600 "$temp_path"
  mv "$temp_path" "$env_path"
}

yeen_append_env_default() {
  local env_path="$1"
  local key="$2"
  local value="$3"
  local resolved_path
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || return 1
  resolved_path="$(readlink -f "$env_path")"
  [[ -f "$resolved_path" ]] || return 1
  grep -Eq "^${key}=" "$resolved_path" && return 0
  printf '%s=%s\n' "$key" "$(yeen_env_quote "$value")" >>"$resolved_path"
}

yeen_env_has_bootstrap_credentials() {
  local env_path="$1"
  local key
  for key in DEFAULT_ADMIN_EMAIL DEFAULT_ADMIN_NAME DEFAULT_ADMIN_PASSWORD; do
    grep -Eq "^${key}=.+" "$env_path" || return 1
  done
}

yeen_append_bootstrap_credentials() {
  local env_path="$1"
  local admin_email="$2"
  local admin_name="$3"
  local admin_password="$4"
  local resolved_path
  resolved_path="$(readlink -f "$env_path")"

  [[ -f "$resolved_path" ]] || {
    yeen_fail "Environment file was not found: $env_path"
    return 1
  }
  if grep -Eq '^DEFAULT_ADMIN_(EMAIL|NAME|PASSWORD)=' "$resolved_path"; then
    yeen_fail "Existing environment has incomplete administrator bootstrap values."
    return 1
  fi

  {
    printf 'DEFAULT_ADMIN_EMAIL=%s\n' "$(yeen_env_quote "$admin_email")"
    printf 'DEFAULT_ADMIN_NAME=%s\n' "$(yeen_env_quote "$admin_name")"
    printf 'DEFAULT_ADMIN_PASSWORD=%s\n' "$(yeen_env_quote "$admin_password")"
  } >>"$resolved_path"
}

yeen_remove_env_keys() {
  local env_path="$1"
  shift
  local resolved_path temp_path key pattern
  resolved_path="$(readlink -f "$env_path")"
  [[ -f "$resolved_path" ]] || {
    yeen_fail "Environment file was not found: $env_path"
    return 1
  }

  pattern=''
  for key in "$@"; do
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || return 1
    pattern="${pattern}${pattern:+|}${key}"
  done

  temp_path="${resolved_path}.new.$$"
  (
    umask 0077
    awk -v keys="^(${pattern})=" '$0 !~ keys { print }' "$resolved_path" >"$temp_path"
  )
  chmod --reference="$resolved_path" "$temp_path" 2>/dev/null || chmod 0600 "$temp_path"
  chown --reference="$resolved_path" "$temp_path" 2>/dev/null || true
  mv "$temp_path" "$resolved_path"
}
