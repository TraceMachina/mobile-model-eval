#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Derived from the original Android model evaluation code and modified by Trace Machina.
# See /NOTICE and /licenses/APACHE-2.0.txt.
set -euo pipefail

SCRIPT_DIR_EARLY="$(cd "$(dirname "$0")" && pwd)"
export CODEX_BIN="${CODEX_BIN:-$SCRIPT_DIR_EARLY/node_modules/.bin/codex}"
export CLAUDE_BIN="${CLAUDE_BIN:-$SCRIPT_DIR_EARLY/node_modules/.bin/claude}"
export GEMINI_BIN="${GEMINI_BIN:-$SCRIPT_DIR_EARLY/node_modules/.bin/gemini}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_PORT=${MCP_PORT:-3000}
ADMIN_PORT=${ADMIN_PORT:-3001}
MCP_PID=""
PLATFORM="${PLATFORM:-android}"
FORWARD_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --platform)
      PLATFORM="${2:-}"
      shift 2
      ;;
    --platform=*)
      PLATFORM="${1#*=}"
      shift
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done

cleanup() {
  echo "Shutting down..."
  if [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null; then
    kill "$MCP_PID" 2>/dev/null
    wait "$MCP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

BRIDGE_DIR=""
BRIDGE_ENTRY=""
DEVICE_IDS=""

case "$PLATFORM" in
  android)
    BRIDGE_DIR="$SCRIPT_DIR/platforms/android/bridge"
    BRIDGE_ENTRY="$BRIDGE_DIR/src/main.ts"
    DEVICE_IDS="${ANDROID_DEVICES:-$(adb devices | grep -E '\s+device$' | awk '{print $1}' | paste -sd, -)}"
    if [ -z "$DEVICE_IDS" ]; then
      echo "No Android devices found. Start an emulator or attach a device first."
      exit 1
    fi
    export ANDROID_DEVICES="$DEVICE_IDS"
    ;;
  ios)
    BRIDGE_DIR="$SCRIPT_DIR/platforms/ios/bridge"
    BRIDGE_ENTRY="$BRIDGE_DIR/src/main.ts"
    DEVICE_IDS="${IOS_SIMULATORS:-$(xcrun simctl list devices available -j | bun -e 'const input = await new Response(Bun.stdin.stream()).text(); const data = JSON.parse(input); const ids = []; for (const runtime of Object.values(data.devices)) { for (const device of runtime) { if (device.isAvailable !== false && device.state === "Booted") ids.push(device.udid); } } process.stdout.write(ids.join(","));')}"
    if [ -z "$DEVICE_IDS" ]; then
      echo "No booted iOS simulators found. Start one with scripts/start-ios-simulator.sh first."
      exit 1
    fi
    export IOS_SIMULATORS="$DEVICE_IDS"
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    echo "Supported platforms: android, ios"
    exit 1
    ;;
esac

DEVICE_COUNT=$(echo "$DEVICE_IDS" | tr ',' '\n' | sed '/^$/d' | wc -l | tr -d ' ')
INSTANCES=${INSTANCES:-$DEVICE_COUNT}
echo "Platform: $PLATFORM"
echo "Devices: $DEVICE_IDS ($DEVICE_COUNT)"
echo "Instances: $INSTANCES"

# Install dependencies if needed.
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing root dependencies..."
  (cd "$SCRIPT_DIR" && bun install)
fi
if [ ! -d "$BRIDGE_DIR/node_modules" ]; then
  echo "Installing platform bridge dependencies..."
  (cd "$BRIDGE_DIR" && bun install)
fi

# Start the MCP + admin server.
echo "Starting $PLATFORM bridge on :$MCP_PORT (admin :$ADMIN_PORT)..."
PORT="$MCP_PORT" ADMIN_PORT="$ADMIN_PORT" bun run "$BRIDGE_ENTRY" &
MCP_PID=$!

# Wait for the MCP server to be ready.
for i in $(seq 1 30); do
  if curl -s "http://localhost:$MCP_PORT" -o /dev/null 2>/dev/null; then
    break
  fi
  sleep 0.5
done

echo "MCP server ready (pid $MCP_PID)"

# Run harness instances in parallel.
echo "Running $INSTANCES harness instance(s)..."
pids=()
for i in $(seq 1 "$INSTANCES"); do
  bun run "$SCRIPT_DIR/index.ts" \
    --platform "$PLATFORM" \
    --mcp-url "http://localhost:$MCP_PORT" \
    --admin-url "http://localhost:$ADMIN_PORT" \
    "${FORWARD_ARGS[@]}" &
  sleep 1
  pids+=($!)
done

# Wait for all harness instances and track failures.
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "$failed/$INSTANCES instance(s) had failures"
  exit 1
fi

echo "All $INSTANCES instance(s) completed successfully"
