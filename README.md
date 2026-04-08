# mobile-model-eval

Benchmark how well LLMs can operate real mobile interfaces using only native
human-style interactions: screenshots, taps, swipes, long-presses, and
physical-button equivalents.

The project now has a shared mobile harness plus separate Android and iOS
platform implementations:

- Android uses `adb`, emulator snapshots, and `scrcpy`.
- iOS uses `simctl`, Simulator video capture, and host-side Simulator window
  automation for touch input.

## Project Layout

```text
mobile-model-eval/
├── platforms/
│   ├── android/
│   │   ├── README.md
│   │   ├── bridge/
│   │   ├── checks.ts
│   │   └── tests/
│   └── ios/
│       ├── README.md
│       ├── bridge/
│       ├── checks.ts
│       └── tests/
├── harness/
├── scripts/
├── widget/
├── LICENSE
├── NOTICE
└── TRADEMARKS.md
```

## Shared Flow

1. The harness creates a device session through the platform bridge.
2. The platform bridge exposes MCP tools to the model.
3. The model drives the device with screenshots and touch/button actions.
4. The harness verifies final device state with platform-specific checks.
5. Results are stored with timings, usage, and video.

## Platform Coverage

| Capability | Android | iOS |
|---|---|---|
| Screenshot MCP tool | Yes | Yes |
| Tap / swipe / long-press | Yes | Yes |
| Physical button tool | Yes | Yes, best-effort via Simulator shortcuts |
| Baseline reset | Emulator snapshot | `simctl erase` + reboot |
| Screen recording | `scrcpy` | `simctl io recordVideo` |
| App install helper | APK via URL | `.app` or zipped `.app` via URL |
| Platform-native admin commands | `adb shell` / `adb emu` | `simctl spawn` / `simctl` |

## Quick Start

Install dependencies for the root package and both bridge workspaces from the
repository root:

```bash
bun install
```

Or, if you prefer npm:

```bash
npm install
```

TypeScript verification is repo-wide and runs all three TypeScript projects
(root harness/app code, Android bridge, iOS bridge):

```bash
bun run typecheck
bun run build
```

`build` currently aliases the full `tsc` verification pass. The repo still runs
TypeScript directly with Bun, so `tsc` is used here for static verification
rather than emitting a separate JavaScript bundle.

Android:

```bash
scripts/start-android-emulator.sh Pixel_8a -no-audio
./run.sh --platform android --provider codex --model gpt-5.4
```

iOS:

```bash
scripts/start-ios-simulator.sh "iPhone 16"
./run.sh --platform ios --provider codex --model gpt-5.4
```

See:

- [Android README](platforms/android/README.md)
- [iOS README](platforms/ios/README.md)

## Important iOS Note

The iOS bridge drives Simulator taps and swipes through host-side window
automation. On macOS, the terminal process running the bridge must have
Accessibility permission, and the Simulator app must be available locally.

## Licensing

The repository defaults to the Business Source License 1.1 owned by Trace
Machina. To preserve the original Android code's Apache obligations, the
Android-derived files called out in `NOTICE` remain distributed with Apache
License 2.0 notices and the Apache text is preserved in
`licenses/APACHE-2.0.txt`.

## Trademarks

See [TRADEMARKS.md](TRADEMARKS.md).
