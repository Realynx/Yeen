#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <container-id>" >&2
  exit 2
fi

container_id=$1
if [[ ! "$container_id" =~ ^[0-9]+$ ]]; then
  echo "Container ID must be numeric." >&2
  exit 2
fi

config_path="/etc/pve/lxc/${container_id}.conf"
if [[ ! -f "$config_path" ]]; then
  echo "Proxmox container config not found: ${config_path}" >&2
  exit 1
fi

required_paths=(
  /dev/nvidia0
  /dev/nvidiactl
  /dev/nvidia-uvm
  /dev/nvidia-uvm-tools
  /lib/x86_64-linux-gnu/libcuda.so.1
  /lib/x86_64-linux-gnu/libnvidia-encode.so.1
  /lib/x86_64-linux-gnu/libnvcuvid.so.1
  /lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so.1
)

for required_path in "${required_paths[@]}"; do
  if [[ ! -e "$required_path" ]]; then
    echo "Required NVIDIA host path is missing: ${required_path}" >&2
    exit 1
  fi
done

backup_path="${config_path}.before-yeen-nvidia-$(date -u +%Y%m%d%H%M%S)"
cp --preserve=all "$config_path" "$backup_path"

ensure_line() {
  local line=$1
  if ! grep -Fqx "$line" "$config_path"; then
    printf '%s\n' "$line" >> "$config_path"
  fi
}

caps_major_hex=$(stat -c '%t' /dev/nvidia-caps/nvidia-cap1)
caps_major=$((16#$caps_major_hex))
ensure_line "lxc.cgroup2.devices.allow: c ${caps_major}:* rwm"

ensure_line 'lxc.mount.entry: /lib/x86_64-linux-gnu/libcuda.so.1 usr/lib/x86_64-linux-gnu/libcuda.so.1 none bind,ro,optional,create=file'
ensure_line 'lxc.mount.entry: /lib/x86_64-linux-gnu/libnvidia-encode.so.1 usr/lib/x86_64-linux-gnu/libnvidia-encode.so.1 none bind,ro,optional,create=file'
ensure_line 'lxc.mount.entry: /lib/x86_64-linux-gnu/libnvcuvid.so.1 usr/lib/x86_64-linux-gnu/libnvcuvid.so.1 none bind,ro,optional,create=file'
ensure_line 'lxc.mount.entry: /lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so.1 usr/lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so.1 none bind,ro,optional,create=file'

echo "Configured NVIDIA runtime passthrough for CT ${container_id}."
echo "Backup: ${backup_path}"
echo "Restart CT ${container_id} before running an NVENC smoke test."
