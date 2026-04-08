# mobile-model-eval for Android

This is the Android slice of `mobile-model-eval`.

It keeps the original Android architecture:

- MCP and admin APIs are served by `platforms/android/bridge`.
- Device control uses `adb` plus emulator snapshot management.
- Recording uses `scrcpy`.
- Verification uses Android shell commands against actual device state.

## Main Components

```text
platforms/android/
├── bridge/
│   └── src/
│       ├── main.ts
│       ├── device_pool.ts
│       └── adb_service.ts
├── checks.ts
└── tests/
```

## Android Test Suite

- `airplane-mode-on`
- `airplane-mode-off`
- `set-alarm-5pm`
- `uninstall-app`

The disabled verification-code test factory is still present in
`platforms/android/tests/verification-code.ts`.

## Requirements

- Bun
- Android SDK with `adb` on `PATH`
- At least one connected Android emulator or device
- `scrcpy`
- `ffmpeg`

## Install Dependencies

Install from the repository root so Bun or npm also installs the Android and
iOS bridge workspace dependencies:

```bash
bun install
```

Or:

```bash
npm install
```

To verify the full repository TypeScript setup:

```bash
bun run typecheck
```

To verify only the Android bridge package:

```bash
cd platforms/android/bridge
bun run typecheck
```

## Start Android

```bash
scripts/start-android-emulator.sh Pixel_8a -no-audio
```

## Run Android Benchmarks

```bash
bun run index.ts --platform android --provider codex --model gpt-5.4
```

Or use the top-level runner:

```bash
./run.sh --platform android --provider codex --model gpt-5.4
```

## Bridge Environment

- `ANDROID_DEVICES`
  Comma-separated ADB serials. `run.sh` auto-detects these when possible.
- `PORT`
  MCP port. Defaults to `3000`.
- `ADMIN_PORT`
  Admin API port. Defaults to `3001`.

## Notes

- Baseline restore uses the Android emulator snapshot named `baseline`.
- The Android bridge remains the authoritative path for ADB shell verification
  and emulator-console-backed tests such as SMS injection.
