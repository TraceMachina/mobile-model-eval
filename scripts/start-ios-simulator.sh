#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-iPhone 16}"

resolve_udid() {
  local target="$1"
  xcrun simctl list devices available -j | bun -e '
    const target = process.argv[1];
    const input = await new Response(Bun.stdin.stream()).text();
    const parsed = JSON.parse(input);
    const devices = Object.values(parsed.devices).flat();
    const match = devices.find((device) => device.udid === target || device.name === target);
    if (!match) process.exit(1);
    process.stdout.write(match.udid);
  ' "$target"
}

UDID="$(resolve_udid "$TARGET")"

xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b
open -a Simulator --args -CurrentDeviceUDID "$UDID"

echo "$UDID"
