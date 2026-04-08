# mobile_model_eval for iOS

This is the iOS slice of `mobile_model_eval`.

It mirrors the Android project shape where practical, but the implementation is
necessarily different because iOS Simulator does not expose an `adb`-style
control plane.

## Main Components

```text
platforms/ios/
├── bridge/
│   ├── src/
│   │   ├── main.ts
│   │   ├── device_pool.ts
│   │   └── simctl_service.ts
│   └── scripts/
│       └── simulator_input.swift
├── checks.ts
└── tests/
```

## How iOS Control Works

- Screenshots use `xcrun simctl io <udid> screenshot`.
- Recording uses `xcrun simctl io <udid> recordVideo`.
- Baseline reset uses `simctl erase`, then boot.
- Shell-style verification uses `xcrun simctl spawn <udid> sh -lc ...`.
- Touch input is translated into host-side Simulator window events by the
  helper in `bridge/scripts/simulator_input.swift`, compiled on demand with
  `xcrun swiftc`.

## iOS Test Suite

- `dark-mode-on`
- `dark-mode-off`
- `increase-contrast-on`
- `content-size-accessibility-large`
- `uninstall-tips-app`

These tests intentionally focus on Simulator-verifiable capabilities. Android
tasks that rely on emulator snapshots, `adb` package management, or emulator
console SMS injection do not map 1:1 to iOS Simulator and are not forced into
the iOS suite.

## Requirements

- macOS
- Xcode command line tools and Simulator runtimes
- Bun
- Accessibility permission for the terminal process that runs the bridge

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

To verify only the iOS bridge package:

```bash
cd platforms/ios/bridge
bun run typecheck
```

## Start iOS

```bash
scripts/start-ios-simulator.sh "iPhone 16"
```

That boots the simulator, waits for boot completion, opens the Simulator app,
and prints the selected UDID.

## Run iOS Benchmarks

```bash
bun run index.ts --platform ios --provider codex --model gpt-5.4
```

Or use the top-level runner:

```bash
./run.sh --platform ios --provider codex --model gpt-5.4
```

## Bridge Environment

- `IOS_SIMULATORS`
  Comma-separated simulator UDIDs or names. `run.sh` auto-detects booted
  simulators when possible.
- `IOS_SIMULATOR_WINDOW_TOP_INSET`
- `IOS_SIMULATOR_WINDOW_LEFT_INSET`
- `IOS_SIMULATOR_WINDOW_RIGHT_INSET`
- `IOS_SIMULATOR_WINDOW_BOTTOM_INSET`

Those optional variables let you calibrate host-side click mapping if your
Simulator window chrome differs from the defaults.

## Notes

- The iOS bridge expects Simulator.app to be locally available.
- Button events are best-effort and are implemented through Simulator keyboard
  shortcuts.
- App installation support is aimed at `.app` bundles and zipped `.app`
  archives, which is the practical Simulator path.
