/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { spawn, type Subprocess } from "bun";
import { createBridgeServer, type BridgePlatformAdapter } from "../../../shared/bridge/server.ts";
import { DevicePool, type AndroidSessionHandle } from "./device_pool.ts";

interface ActiveRecording {
  proc: Subprocess;
  videoPath: string;
  startedAtMs: number;
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT ?? "3001", 10);
const ANDROID_DEVICES = process.env.ANDROID_DEVICES ?? process.env.ADB_DEVICES ?? "";

if (!ANDROID_DEVICES) {
  console.error("ANDROID_DEVICES env var required (comma-separated device serials)");
  process.exit(1);
}

const activeRecordings = new Map<string, ActiveRecording>();

async function downloadToTempFile(url: string): Promise<string> {
  const tmpPath = `/tmp/mobile-model-eval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const proc = Bun.spawn(["curl", "-fsSL", "-o", tmpPath, url], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to download ${url}: ${stderr.trim()}`);
  }
  return tmpPath;
}

async function startRecording(
  deviceSessionId: string,
  handle: AndroidSessionHandle,
  outputPath: string,
): Promise<{ startedAtMs: number }> {
  if (activeRecordings.has(deviceSessionId)) {
    throw new Error(`Recording already active for session ${deviceSessionId}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  const proc = spawn(
    [
      "stdbuf",
      "-oL",
      "scrcpy",
      `--serial=${handle.adb.serial}`,
      `--record=${outputPath}`,
      "--no-window",
      "--no-playback",
      "--video-codec=h264",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const startedAtMs = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("scrcpy did not start recording within 30s"));
    }, 30_000);

    (async () => {
      const errReader = proc.stderr.getReader();
      while (true) {
        const { done, value } = await errReader.read();
        if (done) break;
        console.error(`[scrcpy:${deviceSessionId}] ${new TextDecoder().decode(value).trimEnd()}`);
      }
    })();

    const reader = proc.stdout.getReader();
    let accumulated = "";

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timeout);
          reject(new Error(`scrcpy exited before recording started. stdout: ${accumulated}`));
          return;
        }
        const chunk = new TextDecoder().decode(value);
        accumulated += chunk;
        console.error(`[scrcpy:${deviceSessionId}] ${chunk.trimEnd()}`);

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
    setTimeout(() => reject(new Error("scrcpy did not exit within 10s")), 10_000),
  );

  try {
    await Promise.race([exitPromise, timeoutPromise]);
  } catch {
    console.error(`Force-killing scrcpy for Android session ${deviceSessionId}`);
    recording.proc.kill("SIGKILL");
    await recording.proc.exited;
  }

  activeRecordings.delete(deviceSessionId);
  return { stoppedAtMs: Date.now() };
}

const pool = new DevicePool(
  ANDROID_DEVICES.split(",").map((serial) => serial.trim()).filter(Boolean),
);

const adapter: BridgePlatformAdapter<AndroidSessionHandle> = {
  platform: "android",
  serverName: "mobile-mcp-bridge",
  pool,
  async getScreenSize(handle) {
    return handle.adb.getScreenSize();
  },
  screenshot(handle) {
    return handle.adb.screenshot();
  },
  tap(handle, x, y) {
    return handle.adb.tap(x, y);
  },
  swipe(handle, x1, y1, x2, y2, durationMs) {
    return handle.adb.swipe(x1, y1, x2, y2, durationMs);
  },
  longPress(handle, x, y, durationMs) {
    return handle.adb.longPress(x, y, durationMs);
  },
  keyEvent(handle, key) {
    return handle.adb.keyEvent(key);
  },
  shell(handle, command) {
    return handle.adb.shell(command);
  },
  platformCommand(handle, command) {
    return handle.adb.emuCommand(command);
  },
  loadBaseline(handle) {
    return handle.adb.loadSnapshot("baseline");
  },
  async installAppFromUrl(handle, url) {
    const tmpPath = await downloadToTempFile(url);
    try {
      const destPath = "/data/local/tmp/mobile-model-eval.apk";
      await handle.adb.pushFile(tmpPath, destPath);
      await handle.adb.shell(`pm install ${destPath}`);
      await handle.adb.shell(`rm ${destPath}`);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore temp file cleanup failures.
      }
    }
  },
  async addMediaFromUrl(handle, url) {
    const tmpPath = await downloadToTempFile(url);
    try {
      const filename = url.split("/").pop() || "media";
      const destPath = `/sdcard/Download/${filename}`;
      await handle.adb.pushFile(tmpPath, destPath);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore temp file cleanup failures.
      }
    }
  },
  async openUrl(handle, url) {
    await handle.adb.shell(`am start -a android.intent.action.VIEW -d '${url.replace(/'/g, "'\\''")}'`);
  },
  startRecording,
  stopRecording,
};

createBridgeServer(adapter, { port: PORT, adminPort: ADMIN_PORT });
