#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_REPOSITORY="Realynx/Yeen"
REPOSITORY="${YEEN_GITHUB_REPOSITORY:-$DEFAULT_REPOSITORY}"
VERSION="${YEEN_RELEASE_VERSION:-latest}"
CURL_CONFIG=""
TEMP_DIRECTORY=""
INSTALLER_ARGUMENTS=()

log() { printf '[yeen-bootstrap] %s\n' "$*"; }
fail() { printf '[yeen-bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: install-github-release.sh [--repo OWNER/REPO] [--version latest|vX.Y.Z] [-- INSTALL_OPTIONS]

Environment:
  YEEN_GITHUB_REPOSITORY  Repository to download from (default: Realynx/Yeen)
  YEEN_RELEASE_VERSION    Release tag or "latest"
  GH_TOKEN/GITHUB_TOKEN   Optional token for private repositories; never passed on the command line

Arguments after -- are forwarded to the packaged deployment/scripts/install.sh.
EOF
}

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -ge 2 ]] || fail '--repo requires OWNER/REPO.'
        REPOSITORY="$2"
        shift 2
        ;;
      --version)
        [[ $# -ge 2 ]] || fail '--version requires latest or vX.Y.Z.'
        VERSION="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      --)
        shift
        INSTALLER_ARGUMENTS=("$@")
        return
        ;;
      *)
        fail "Unknown bootstrap option: $1 (put installer options after --)."
        ;;
    esac
  done
}

validate_inputs() {
  [[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
    || fail 'Repository must use OWNER/REPO syntax.'
  [[ "$VERSION" == 'latest' || "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail 'Version must be latest or a vMAJOR.MINOR.PATCH tag.'
}

forward_installer_environment() {
  # Keep a fork-selected release channel aligned with future in-app updates.
  # Environment propagation avoids exposing repository configuration in argv.
  export YEEN_UPDATE_REPOSITORY="$REPOSITORY"
}

configure_authenticated_curl() {
  local github_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  [[ -n "$github_token" ]] || return 0
  [[ "$github_token" != *$'\n'* && "$github_token" != *'"'* ]] \
    || fail 'GitHub token contains unsupported characters.'
  CURL_CONFIG="$TEMP_DIRECTORY/curl-auth.conf"
  umask 077
  printf 'header = "Authorization: Bearer %s"\n' "$github_token" > "$CURL_CONFIG"
  unset github_token GH_TOKEN GITHUB_TOKEN
}

github_curl() {
  local arguments=(--fail --silent --show-error --proto '=https' --tlsv1.2)
  if [[ -n "$CURL_CONFIG" ]]; then
    arguments+=(--config "$CURL_CONFIG")
  fi
  command curl "${arguments[@]}" "$@"
}

download_release_asset() {
  local source_url="$1"
  local destination_path="$2"
  if [[ -z "$CURL_CONFIG" ]]; then
    github_curl --location --output "$destination_path" "$source_url"
    return
  fi

  # Resolve GitHub's signed asset URL without forwarding the repository token
  # to the separate object-storage host used by the redirect.
  local headers_path="$TEMP_DIRECTORY/asset-headers.$RANDOM"
  github_curl --dump-header "$headers_path" --output /dev/null "$source_url"
  local redirect_url
  redirect_url="$(sed -n 's/^[Ll]ocation:[[:space:]]*//p' "$headers_path" \
    | tr -d '\r' \
    | tail -n 1)"
  rm -f -- "$headers_path"
  [[ "$redirect_url" =~ ^https:// ]] \
    || fail 'GitHub did not return a secure release asset redirect.'
  command curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 \
    --output "$destination_path" "$redirect_url"
}

resolve_release_tag() {
  if [[ "$VERSION" != 'latest' ]]; then
    printf '%s\n' "$VERSION"
    return
  fi

  local response tag
  response="$(github_curl \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/$REPOSITORY/releases/latest")"
  tag="$(printf '%s\n' "$response" \
    | sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1)"
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail 'Latest GitHub Release did not contain a valid Yeen version tag.'
  printf '%s\n' "$tag"
}

expected_sha_from_file() {
  local checksum_path="$1"
  local archive_name="$2"
  local found_sha="" line_sha line_name extra

  while read -r line_sha line_name extra; do
    line_name="${line_name#\*}"
    if [[ -z "${extra:-}" && "$line_name" == "$archive_name" \
      && "$line_sha" =~ ^[a-fA-F0-9]{64}$ ]]; then
      [[ -z "$found_sha" ]] || fail 'Checksum file contains duplicate archive entries.'
      found_sha="${line_sha,,}"
    fi
  done < "$checksum_path"

  [[ -n "$found_sha" ]] || fail 'Checksum file does not authenticate the expected archive.'
  printf '%s\n' "$found_sha"
}

verify_archive() {
  local archive_path="$1"
  local checksum_path="$2"
  local archive_name="$3"
  local expected_sha actual_sha
  expected_sha="$(expected_sha_from_file "$checksum_path" "$archive_name")"
  actual_sha="$(sha256sum "$archive_path" | awk '{print tolower($1)}')"
  [[ "$actual_sha" == "$expected_sha" ]] || fail 'Downloaded release checksum mismatch.'
  printf '%s\n' "$expected_sha"
}

extract_verified_installer() {
  local archive_path="$1"
  local installer_directory="$2"
  local required_installer_entry
  mkdir -p "$installer_directory"
  for required_installer_entry in \
    deployment/scripts/install.sh \
    deployment/scripts/install-lib.sh \
    deployment/scripts/install-release.sh; do
    [[ "$(unzip -Z1 "$archive_path" | grep -Fxc "$required_installer_entry")" -eq 1 ]] \
      || fail "Verified archive must contain exactly one $required_installer_entry entry."
    unzip -p "$archive_path" "$required_installer_entry" \
      > "$installer_directory/${required_installer_entry##*/}"
  done
  chmod 0700 "$installer_directory/install.sh" \
    "$installer_directory/install-release.sh"
}

main() {
  parse_arguments "$@"
  validate_inputs
  # A minimal host may have curl but no unzip yet. The packaged installer
  # installs the full runtime after the bootstrap verifies its archive.
  if ! command -v unzip >/dev/null; then
    [[ "${EUID:-$(id -u)}" -eq 0 ]] || fail 'Install unzip or run the bootstrap with sudo.'
    if command -v apt-get >/dev/null; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates unzip
    elif command -v dnf >/dev/null; then
      dnf install -y ca-certificates unzip
    else
      fail 'Install unzip before running the bootstrap.'
    fi
  fi
  for command_name in curl sha256sum unzip sed awk; do
    command -v "$command_name" >/dev/null || fail "Missing required command: $command_name"
  done

  TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/yeen-bootstrap.XXXXXXXX")"
  trap 'rm -rf -- "$TEMP_DIRECTORY"' EXIT
  chmod 0700 "$TEMP_DIRECTORY"
  configure_authenticated_curl
  forward_installer_environment

  local tag archive_name checksum_name release_url archive_path checksum_path sha installer_path release_id
  tag="$(resolve_release_tag)"
  archive_name="yeen-$tag.zip"
  checksum_name="$archive_name.sha256"
  release_url="https://github.com/$REPOSITORY/releases/download/$tag"
  archive_path="$TEMP_DIRECTORY/$archive_name"
  checksum_path="$TEMP_DIRECTORY/$checksum_name"

  log "Downloading Yeen $tag from $REPOSITORY."
  download_release_asset "$release_url/$archive_name" "$archive_path"
  download_release_asset "$release_url/$checksum_name" "$checksum_path"
  sha="$(verify_archive "$archive_path" "$checksum_path" "$archive_name")"
  log "SHA-256 verified: $sha"

  local installer_directory="$TEMP_DIRECTORY/installer/deployment/scripts"
  extract_verified_installer "$archive_path" "$installer_directory"
  installer_path="$installer_directory/install.sh"
  release_id="${tag#v}-${sha:0:12}"

  local installer_command=(
    bash "$installer_path"
    --archive "$archive_path"
    --sha256 "$sha"
    --release-id "$release_id"
    "${INSTALLER_ARGUMENTS[@]}"
  )
  if [[ -r /dev/tty && -w /dev/tty ]]; then
    "${installer_command[@]}" < /dev/tty
  else
    "${installer_command[@]}"
  fi
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]:-}" == "$0" ]]; then
  main "$@"
fi
