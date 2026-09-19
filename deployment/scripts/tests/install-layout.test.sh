#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deployment/scripts/install-lib.sh
source "$SCRIPT_DIR/../install-lib.sh"

TEST_ROOT="$(mktemp -d)"
trap '[[ -n "$TEST_ROOT" && "$TEST_ROOT" == "${TMPDIR:-/tmp}/"* ]] && rm -rf "$TEST_ROOT"' EXIT

pass_count=0
pass() {
  pass_count=$((pass_count + 1))
  printf 'PASS %s\n' "$1"
}

fail_test() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

for unsafe_install_root in / /opt /var relative/path /opt/yeen/ /opt/yeen/.. /opt/yeen/../other; do
  if yeen_validate_install_root "$unsafe_install_root"; then
    fail_test "unsafe install root was accepted: $unsafe_install_root"
  fi
done
yeen_validate_install_root /opt/yeen || fail_test 'standard deploy root was rejected'
yeen_validate_install_root /var/www/yeen || fail_test 'standard legacy root was rejected'
pass 'broad, relative, traversal, and non-canonical install roots are rejected'

yeen_validate_tls_hostname yeen.fox || fail_test 'valid TLS hostname was rejected'
if yeen_validate_tls_hostname 'bad/name'; then
  fail_test 'TLS hostname with a path separator was accepted'
fi
if yeen_validate_tls_hostname 'bad..name'; then
  fail_test 'TLS hostname with an empty label was accepted'
fi
pass 'TLS hostnames reject unsafe and malformed values'

[[ "$(yeen_node_archive_arch x86_64)" == 'x64' ]] || fail_test 'x64 Node archive mapping failed'
[[ "$(yeen_node_archive_arch aarch64)" == 'arm64' ]] || fail_test 'arm64 Node archive mapping failed'
if yeen_node_archive_arch i686 >/dev/null; then
  fail_test 'unsupported Node archive architecture was accepted'
fi
pass 'official Node runtime architecture mapping covers x64 and arm64 only'

assert_file_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail_test "$file did not contain: $expected"
}

legacy="$TEST_ROOT/legacy"
root="$TEST_ROOT/adopted"
mkdir -p "$legacy/data/addons/packages"
printf '[{"id":"account-1"}]\n' >"$legacy/data/accounts.json"
printf '{"mediaMetadataSqlitePath":"data/media-metadata.sqlite"}\n' \
  >"$legacy/data/system-settings.json"
printf 'sqlite-state' >"$legacy/data/media-metadata.sqlite"
printf 'addon-state' >"$legacy/data/addons/registry.json"
printf 'package-state' >"$legacy/data/addons/packages/private.zip"
printf 'JWT_SECRET=legacy-secret-that-must-not-change\n' >"$legacy/.env"
before_hash="$(find "$legacy" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum)"

yeen_adopt_shared_layout "$root" "$legacy"
after_hash="$(find "$legacy" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum)"
[[ "$before_hash" == "$after_hash" ]] || fail_test 'legacy state changed during adoption'
[[ -L "$root/shared/data" ]] || fail_test 'legacy data was not adopted by link'
[[ -L "$root/shared/yeen.env" ]] || fail_test 'legacy env was not adopted by link'
[[ -L "$root/shared/addons" ]] || fail_test 'legacy add-ons were not adopted by link'
[[ "$(cat "$root/shared/data/accounts.json")" == '[{"id":"account-1"}]' ]] \
  || fail_test 'adopted account data changed'
[[ "$(cat "$root/shared/addons/packages/private.zip")" == 'package-state' ]] \
  || fail_test 'adopted private add-on changed'
yeen_adopt_shared_layout "$root" "$legacy"
[[ "$before_hash" == "$(find "$legacy" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum)" ]] \
  || fail_test 'idempotent adoption changed legacy state'
pass 'legacy data, env, SQLite, and add-ons are adopted without mutation'

shared_root="$TEST_ROOT/shared-existing"
other_legacy="$TEST_ROOT/other-legacy"
mkdir -p "$shared_root/shared/data" "$shared_root/shared/addons" "$other_legacy/data"
printf '[{"id":"shared-account"}]\n' >"$shared_root/shared/data/accounts.json"
printf 'shared-env\n' >"$shared_root/shared/yeen.env"
printf 'shared-addon\n' >"$shared_root/shared/addons/registry.json"
printf '[{"id":"legacy-account"}]\n' >"$other_legacy/data/accounts.json"
printf 'legacy-env\n' >"$other_legacy/.env"
yeen_adopt_shared_layout "$shared_root" "$other_legacy"
[[ ! -L "$shared_root/shared/data" ]] || fail_test 'existing shared data was replaced by a link'
[[ "$(cat "$shared_root/shared/data/accounts.json")" == '[{"id":"shared-account"}]' ]] \
  || fail_test 'existing shared accounts changed'
[[ "$(cat "$shared_root/shared/yeen.env")" == 'shared-env' ]] \
  || fail_test 'existing shared env changed'
[[ "$(cat "$shared_root/shared/addons/registry.json")" == 'shared-addon' ]] \
  || fail_test 'existing shared add-ons changed'
pass 'existing /opt-style shared layout remains authoritative'

unsafe_root="$TEST_ROOT/unsafe/root"
outside_state="$TEST_ROOT/outside-state"
mkdir -p "$unsafe_root/shared" "$outside_state" "$unsafe_root/shared/addons"
ln -s "$outside_state" "$unsafe_root/shared/data"
printf 'safe-env\n' >"$unsafe_root/shared/yeen.env"
if yeen_validate_shared_targets "$unsafe_root" "$TEST_ROOT/unsafe/legacy"; then
  fail_test 'shared data link outside approved layouts was accepted'
fi
pass 'shared links outside managed roots are rejected before ownership changes'

addon_source="$TEST_ROOT/addon-source"
addon_backup="$TEST_ROOT/snapshots/addons"
addon_quarantine="$TEST_ROOT/quarantine/failed-addons"
mkdir -p "$addon_source/packages/private"
printf 'original-registry\n' >"$addon_source/registry.json"
printf 'original-package\n' >"$addon_source/packages/private/plugin.js"
yeen_backup_directory_snapshot "$addon_source" "$addon_backup" \
  || fail_test 'add-on snapshot failed'
printf 'mutated-registry\n' >"$addon_source/registry.json"
printf 'new-failed-file\n' >"$addon_source/failed-only.txt"
yeen_restore_directory_snapshot "$addon_source" "$addon_backup" "$addon_quarantine" \
  || fail_test 'add-on snapshot restore failed'
[[ "$(cat "$addon_source/registry.json")" == 'original-registry' \
  && "$(cat "$addon_source/packages/private/plugin.js")" == 'original-package' ]] \
  || fail_test 'restored add-ons do not match the snapshot'
[[ ! -e "$addon_source/failed-only.txt" \
  && "$(cat "$addon_quarantine/failed-only.txt")" == 'new-failed-file' ]] \
  || fail_test 'failed add-on mutations were not quarantined'
pass 'add-on rollback restores the snapshot and quarantines failed mutations'

failed_release="$TEST_ROOT/releases/v1.partial"
failed_quarantine="$TEST_ROOT/incoming/v1.failed-partial"
mkdir -p "$failed_release"
printf 'partial\n' >"$failed_release/package.json"
if yeen_quarantine_failed_release_path \
  "$failed_release" "$TEST_ROOT/releases/not-the-candidate" "$failed_quarantine"; then
  fail_test 'release quarantine accepted a mismatched expected path'
fi
yeen_quarantine_failed_release_path "$failed_release" "$failed_release" "$failed_quarantine" \
  || fail_test 'failed release quarantine rejected the exact path'
[[ ! -e "$failed_release" && -f "$failed_quarantine/package.json" ]] \
  || fail_test 'failed release was not moved out of the retry path'
pass 'failed release cleanup only quarantines the exact validated path'

fresh_root="$TEST_ROOT/fresh"
yeen_adopt_shared_layout "$fresh_root" "$TEST_ROOT/no-legacy"
[[ -d "$fresh_root/shared/data" && -d "$fresh_root/shared/addons" ]] \
  || fail_test 'fresh persistent directories were not created'
[[ ! -e "$fresh_root/shared/yeen.env" ]] \
  || fail_test 'fresh adoption invented an environment file'
pass 'fresh persistent layout is created without placeholder runtime state'

tls_root="$TEST_ROOT/tls/root"
mkdir -p "$tls_root/shared"
yeen_ensure_self_signed_tls "$tls_root" "$(id -gn)" 'yeen.fox' \
  || fail_test 'self-signed TLS provisioning failed'
[[ -f "$tls_root/shared/tls/yeen.crt" && -f "$tls_root/shared/tls/yeen.key" ]] \
  || fail_test 'self-signed TLS files were not persisted'
openssl x509 -in "$tls_root/shared/tls/yeen.crt" -noout -ext subjectAltName \
  | grep -q 'DNS:yeen.fox' || fail_test 'certificate SAN omitted the configured hostname'
tls_before="$(sha256sum "$tls_root/shared/tls/yeen.crt" "$tls_root/shared/tls/yeen.key")"
yeen_ensure_self_signed_tls "$tls_root" "$(id -gn)" 'yeen.fox' \
  || fail_test 'idempotent TLS provisioning failed'
[[ "$tls_before" == "$(sha256sum "$tls_root/shared/tls/yeen.crt" "$tls_root/shared/tls/yeen.key")" ]] \
  || fail_test 'existing TLS identity was unexpectedly rotated'
pass 'self-signed TLS identity is valid, hostname-scoped, and persistent'

env_path="$fresh_root/shared/yeen.env"
umask 0022
yeen_write_initial_env "$env_path" 4400 'https://media.example.com' \
  'https://media.example.com' '0123456789abcdef0123456789abcdef0123456789abcdef' \
  'root@example.com' 'Root Admin' 'Strong $word "quoted" 123' '/srv/media' \
  "$fresh_root/shared/addons"
[[ "$(umask)" == '0022' ]] \
  || fail_test 'initial environment writer leaked its restrictive umask'
assert_file_contains "$env_path" 'PORT=4400'
assert_file_contains "$env_path" 'CORS_ORIGIN="https://media.example.com"'
assert_file_contains "$env_path" 'DEFAULT_ADMIN_PASSWORD="Strong $word \"quoted\" 123"'
assert_file_contains "$env_path" 'YEEN_SUPERVISED_RESTART=true'
assert_file_contains "$env_path" 'YEEN_UPDATE_REPOSITORY="Realynx/Yeen"'
assert_file_contains "$env_path" 'YEEN_UPDATE_CHANNEL="stable"'
assert_file_contains "$env_path" 'YEEN_UPDATE_MAX_ARCHIVE_BYTES=2147483648'
assert_file_contains "$env_path" 'YEEN_DEPLOYMENT_MODE=systemd'
umask 0022
yeen_remove_env_keys "$env_path" \
  DEFAULT_ADMIN_EMAIL DEFAULT_ADMIN_NAME DEFAULT_ADMIN_PASSWORD
[[ "$(umask)" == '0022' ]] \
  || fail_test 'environment scrubber leaked its restrictive umask'
grep -q '^DEFAULT_ADMIN_' "$env_path" \
  && fail_test 'plaintext bootstrap values survived scrubbing'
assert_file_contains "$env_path" 'JWT_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef"'
pass 'fresh env is explicit and one-time plaintext credentials are scrubbed'

fork_env="$TEST_ROOT/fork.env"
YEEN_UPDATE_REPOSITORY=private-owner/yeen-fork \
  yeen_write_initial_env "$fork_env" 4400 'https://media.example.com' \
    'https://media.example.com' '0123456789abcdef0123456789abcdef0123456789abcdef' \
    '' '' '' '/srv/media' "$fresh_root/shared/addons"
assert_file_contains "$fork_env" 'YEEN_UPDATE_REPOSITORY="private-owner/yeen-fork"'
pass 'fresh env preserves the bootstrap-selected update repository'

defaults_env="$TEST_ROOT/defaults.env"
printf 'YEEN_UPDATE_REPOSITORY=private/fork\n' >"$defaults_env"
yeen_append_env_default "$defaults_env" YEEN_UPDATE_REPOSITORY Realynx/Yeen
yeen_append_env_default "$defaults_env" YEEN_DEPLOYMENT_MODE systemd
[[ "$(grep -c '^YEEN_UPDATE_REPOSITORY=' "$defaults_env")" -eq 1 ]] \
  || fail_test 'existing updater repository was duplicated'
assert_file_contains "$defaults_env" 'YEEN_UPDATE_REPOSITORY=private/fork'
assert_file_contains "$defaults_env" 'YEEN_DEPLOYMENT_MODE="systemd"'
pass 'missing updater defaults append without overwriting user values'

secret_file="$TEST_ROOT/admin-password"
printf 'StrongPassword123!\n' >"$secret_file"
chmod 0600 "$secret_file"
yeen_validate_secret_file "$secret_file" "$(id -u)" \
  || fail_test 'mode-0600 owned password file was rejected'
chmod 0640 "$secret_file"
if (( (8#$(stat -c '%a' "$secret_file") & 077) != 0 )); then
  if yeen_validate_secret_file "$secret_file" "$(id -u)"; then
    fail_test 'group-readable password file was accepted'
  fi
else
  printf 'SKIP filesystem does not expose POSIX group mode bits\n'
fi
chmod 0600 "$secret_file"
ln -s "$secret_file" "$TEST_ROOT/admin-password-link"
if yeen_validate_secret_file "$TEST_ROOT/admin-password-link" "$(id -u)"; then
  fail_test 'symlink password file was accepted'
fi
pass 'password file rejects symlinks and group/world access'

repository_root="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
rendered_updater="$TEST_ROOT/rendered-updater"
yeen_render_updater_assets \
  "$repository_root" '/srv/yeen-custom' '/var/lib/yeen-legacy' 'custom-yeen' \
  'yeen-service' 'yeen-group' 'private/fork' 'prerelease' '104857600' \
  '/srv/yeen-custom/shared/runtime/node-current/bin/node' \
  '/srv/yeen-custom/shared/runtime/node-current/bin/npm' \
  "$rendered_updater" || fail_test 'updater assets did not render'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'ExecStart=/srv/yeen-custom/current/deployment/updater/yeen-apply-staged-update.sh %i'
assert_file_contains "$rendered_updater/yeen-update-sudoers" \
  'yeen-service ALL=(root) NOPASSWD:'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_DEPLOY_ROOT=/srv/yeen-custom'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_LEGACY_ROOT=/var/lib/yeen-legacy'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_SERVICE_NAME=custom-yeen'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_UPDATE_REPOSITORY=private/fork'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_UPDATE_CHANNEL=prerelease'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_UPDATE_STATUS_ROOT=/srv/yeen-custom/shared/update-status'
assert_file_contains "$rendered_updater/yeen-update@.service" \
  'Environment=YEEN_NODE_BINARY=/srv/yeen-custom/shared/runtime/node-current/bin/node'
grep -q '/opt/yeen' "$rendered_updater/yeen-update@.service" \
  && fail_test 'custom deploy root left a hardcoded updater path'
validation_unit_dir="$TEST_ROOT/validation-unit"
yeen_render_updater_validation_unit \
  "$rendered_updater/yeen-update@.service" '/srv/yeen-custom' \
  '/srv/yeen-custom/releases/v1' "$validation_unit_dir"
assert_file_contains "$validation_unit_dir/yeen-update@.service" \
  'ExecStart=/srv/yeen-custom/releases/v1/deployment/updater/yeen-apply-staged-update.sh %i'
grep -q '/srv/yeen-custom/current' "$validation_unit_dir/yeen-update@.service" \
  && fail_test 'pre-cutover validation still depended on current symlink'
pass 'updater assets render for custom layout and validate against the staged release'

printf '[]\n' >"$fresh_root/shared/data/accounts.json"
set +e
yeen_accounts_state "$fresh_root/shared/data"
empty_status=$?
set -e
[[ "$empty_status" -eq 1 ]] || fail_test 'empty account array state was not reported'
printf '[{"id":"root"}]\n' >"$fresh_root/shared/data/accounts.json"
yeen_accounts_state "$fresh_root/shared/data" \
  || fail_test 'existing account state was not reported'
printf '{"bad":true}\n' >"$fresh_root/shared/data/accounts.json"
set +e
yeen_accounts_state "$fresh_root/shared/data"
invalid_status=$?
set -e
[[ "$invalid_status" -eq 2 ]] || fail_test 'invalid account state was not rejected'
pass 'account detection distinguishes fresh, upgrade, and corrupt state'

printf 'Completed %s installer fixture tests.\n' "$pass_count"
