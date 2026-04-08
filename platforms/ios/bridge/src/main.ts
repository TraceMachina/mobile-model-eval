import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { spawn, type Subprocess } from "bun";
import { createBridgeServer, type BridgePlatformAdapter } from "../../../shared/bridge/server.ts";
import { DevicePool, type IOSSessionHandle } from "./device_pool.ts";
import { resolveSimulators } from "./simctl_service.ts";

interface ActiveRecording {
  proc: Subprocess;
  videoPath: string;
  startedAtMs: number;
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT ?? "3001", 10);
const IOS_SIMULATORS = process.env.IOS_SIMULATORS ?? "";

if (!IOS_SIMULATORS) {
  console.error("IOS_SIMULATORS env var required (comma-separated simulator UDIDs or names)");
  process.exit(1);
}

const activeRecordings = new Map<string, ActiveRecording>();

async function startRecording(
  deviceSessionId: string,
  handle: IOSSessionHandle,
  outputPath: string,
): Promise<{ startedAtMs: number }> {
  if (activeRecordings.has(deviceSessionId)) {
    throw new Error(`Recording already active for session ${deviceSessionId}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  const proc = spawn(
    [
      "xcrun",
      "simctl",
      "io",
      handle.deviceId,
      "recordVideo",
      "--codec=h264",
      "--force",
      outputPath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const startedAtMs = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("simctl recordVideo did not start within 30s"));
    }, 30_000);

    const reader = proc.stderr.getReader();
    let accumulated = "";

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timeout);
          reject(new Error(`simctl recordVideo exited before recording started. stderr: ${accumulated}`));
          return;
        }
        const chunk = new TextDecoder().decode(value);
        accumulated += chunk;
        console.error(`[simctl-record:${deviceSessionId}] ${chunk.trimEnd()}`);

        if (accumulated.includes("Recording started")) {
          clearTimeout(timeout);
          resolve(Date.now());
        } else {
          read();
        }
      }, (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }

    read();
  });

  activeRecordings.set(deviceSessionId, { proc, videoPath: outputPath, startedAtMs });
  return { startedAtMs };
}

async function stopRecording(deviceSessionId: string): Promise<{ stoppedAtMs: number }> {
  const recording = activeRecordings.get(deviceSessionId);
  if (!recording) {
    throw new Error(`No active recording for session ${deviceSessionId}`);
  }

  recording.proc.kill("SIGINT");

  const exitPromise = recording.proc.exited;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("simctl recordVideo did not exit within 10s")), 10_000),
  );

  try {
    await Promise.race([exitPromise, timeoutPromise]);
  } catch {
    console.error(`Force-killing simctl recordVideo for iOS session ${deviceSessionId}`);
    recording.proc.kill("SIGKILL");
    await recording.proc.exited;
  }

  activeRecordings.delete(deviceSessionId);
  return { stoppedAtMs: Date.now() };
}

const simulators = await resolveSimulators(
  IOS_SIMULATORS.split(",").map((identifier) => identifier.trim()).filter(Boolean),
);
const pool = new DevicePool(simulators);

const adapter: BridgePlatformAdapter<IOSSessionHandle> = {
  platform: "ios",
  serverName: "mobile-mcp-bridge",
  pool,
  getScreenSize(handle) {
    return handle.simctl.getScreenSize();
  },
  screenshot(handle) {
    return handle.simctl.screenshot();
  },
  tap(handle, x, y) {
    return handle.simctl.tap(x, y);
  },
  swipe(handle, x1, y1, x2, y2, durationMs) {
    return handle.simctl.swipe(x1, y1, x2, y2, durationMs);
  },
  longPress(handle, x, y, durationMs) {
    return handle.simctl.longPress(x, y, durationMs);
  },
  keyEvent(handle, key) {
    return handle.simctl.keyEvent(key);
  },
  shell(handle, command) {
    return handle.simctl.shell(command);
  },
  platformCommand(handle, command) {
    return handle.simctl.platformCommand(command);
  },
  loadBaseline(handle) {
    return handle.simctl.resetToBaseline();
  },
  installAppFromUrl(handle, url) {
    return handle.simctl.installAppFromUrl(url);
  },
  addMediaFromUrl(handle, url) {
    return handle.simctl.addMediaFromUrl(url);
  },
  openUrl(handle, url) {
    return handle.simctl.openUrl(url);
  },
  startRecording,
  stopRecording,
};

createBridgeServer(adapter, { port: PORT, adminPort: ADMIN_PORT });
