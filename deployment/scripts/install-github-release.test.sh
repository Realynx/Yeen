#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deployment/scripts/install-github-release.sh
source "$SCRIPT_DIR/install-github-release.sh"

REPOSITORY='private-owner/yeen-fork'
unset YEEN_UPDATE_REPOSITORY || true
forward_installer_environment
[[ "$YEEN_UPDATE_REPOSITORY" == "$REPOSITORY" ]]

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/yeen-bootstrap-test.XXXXXXXX")"
trap 'rm -rf -- "$temporary_directory"' EXIT
archive_name='yeen-v1.2.3.zip'
archive_path="$temporary_directory/$archive_name"
checksum_path="$temporary_directory/$archive_name.sha256"
printf 'release fixture' > "$archive_path"
expected_sha="$(sha256sum "$archive_path" | awk '{print tolower($1)}')"
printf '%s  %s\n' "$expected_sha" "$archive_name" > "$checksum_path"

actual_sha="$(verify_archive "$archive_path" "$checksum_path" "$archive_name")"
[[ "$actual_sha" == "$expected_sha" ]]

printf '0%.0s' {1..64} > "$checksum_path"
printf '  %s\n' "$archive_name" >> "$checksum_path"
if (verify_archive "$archive_path" "$checksum_path" "$archive_name" >/dev/null 2>&1); then
  printf 'corrupt checksum unexpectedly passed\n' >&2
  exit 1
fi

fixture_root="$temporary_directory/fixture"
mkdir -p "$fixture_root/deployment/scripts"
for script_name in install.sh install-lib.sh install-release.sh; do
  printf '#!/usr/bin/env bash\nprintf "%s\\n"\n' "$script_name" \
    > "$fixture_root/deployment/scripts/$script_name"
done
fixture_archive="$temporary_directory/installer.zip"
(
  cd "$fixture_root"
  zip -q "$fixture_archive" deployment/scripts/*.sh
)
extracted_directory="$temporary_directory/extracted/deployment/scripts"
extract_verified_installer "$fixture_archive" "$extracted_directory"
for script_name in install.sh install-lib.sh install-release.sh; do
  cmp "$fixture_root/deployment/scripts/$script_name" \
    "$extracted_directory/$script_name"
done

printf 'GitHub bootstrap checksum and installer extraction tests passed.\n'
