#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Derived from the original Android model evaluation code and modified by Trace Machina.
# See /NOTICE and /licenses/APACHE-2.0.txt.
# Wrapper around the Android emulator that ensures orphaned QEMU child
# processes are cleaned up on exit.
set -euo pipefail

AVD_NAME="${1:-Pixel_8a}"
shift 2>/dev/null || true

export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/home/allada/.config/.android/avd}"

EMULATOR="/home/allada/Android/Sdk/emulator/emulator"

ICD_DIR="/run/opengl-driver/share/vulkan/icd.d"
if [ -d "$ICD_DIR" ] && [ -z "${VK_ICD_FILENAMES:-}" ]; then
  export VK_ICD_FILENAMES
  VK_ICD_FILENAMES=$(find "$ICD_DIR" -name '*.json' -printf '%p:' | sed 's/:$//')
fi

setsid "$EMULATOR" -avd "$AVD_NAME" \
  -netdelay none \
  -netspeed full \
  -no-audio \
  "$@" &
EMU_PID=$!

sleep 1
PGID=$(ps -o pgid= -p "$EMU_PID" 2>/dev/null | tr -d ' ') || true

cleanup() {
  echo "Cleaning up emulator processes..."
  if [ -n "$PGID" ]; then
    kill -TERM -"$PGID" 2>/dev/null || true
    sleep 2
    kill -KILL -"$PGID" 2>/dev/null || true
  fi
  if kill -0 "$EMU_PID" 2>/dev/null; then
    kill -KILL "$EMU_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

wait "$EMU_PID" 2>/dev/null || true

if [ -n "$PGID" ]; then
  sleep 1
  kill -KILL -"$PGID" 2>/dev/null || true
fi
