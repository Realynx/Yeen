#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../install-compose.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/media drive"
calls="$TEST_ROOT/calls"

# No network or container daemon: record the actual orchestration commands.
docker() { printf '%s\n' "$*" >> "$calls"; }
podman() { printf '%s\n' "$*" >> "$calls"; }
curl() {
  local output=''
  while (($#)); do
    if [[ "$1" == --output ]]; then output="$2"; shift 2; else shift; fi
  done
  cp "$SCRIPT_DIR/../../docker/compose.yml" "$output"
}

for engine in docker podman; do
  install_root="$TEST_ROOT/$engine"
  (main --engine "$engine" --media "$TEST_ROOT/media drive" --directory "$install_root") > "$TEST_ROOT/output"
  [[ -f "$install_root/.env" && -f "$install_root/compose.yml" ]]
  grep -q '^JWT_SECRET=[a-f0-9]\{96\}$' "$install_root/.env"
  grep -q '^DEFAULT_ADMIN_PASSWORD=[a-f0-9]\{36\}$' "$install_root/.env"
  grep -q '^CORS_ORIGIN=http://localhost:4000$' "$install_root/.env"
  grep -Fq "YEEN_MEDIA_PATH='$TEST_ROOT/media drive'" "$install_root/.env"
  original="$(sha256sum "$install_root/.env")"
  if (main --engine "$engine" --media "$TEST_ROOT/media drive" --directory "$install_root") >/dev/null 2>&1; then
    printf 'Existing configuration unexpectedly overwritten\n' >&2; exit 1
  fi
  [[ "$(sha256sum "$install_root/.env")" == "$original" ]]
done
grep -q '^compose config --quiet$' "$calls"
grep -q '^compose pull$' "$calls"
grep -q '^compose up -d$' "$calls"
if (main --media "$TEST_ROOT/missing" --directory "$TEST_ROOT/invalid") >/dev/null 2>&1; then
  printf 'Missing media directory unexpectedly accepted\n' >&2; exit 1
fi
cat "$SCRIPT_DIR/../install-compose.sh" | bash -s -- --help >/dev/null
cat "$SCRIPT_DIR/../install-github-release.sh" | bash -s -- --help >/dev/null
printf 'Compose setup and piped bootstrap tests passed.\n'
