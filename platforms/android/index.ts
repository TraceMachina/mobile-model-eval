/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { PlatformDefinition } from "../types.ts";
import { androidTests } from "./tests/index.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const androidPlatform: PlatformDefinition = {
  id: "android",
  displayName: "Android",
  mcpServerName: "mobile-mcp-bridge",
  recordingExtension: "mkv",
  tests: androidTests,
  createSessionAdminContext(admin, sessionId, session) {
    return {
      platform: "android",
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      shell: (command: string) => admin.runShellCommand(sessionId, command),
      platformCommand: (command: string) => admin.runPlatformCommand(sessionId, command),
      installAppFromUrl: (url: string) => admin.installAppFromUrl(sessionId, url),
      addMediaFromUrl: (url: string) => admin.addMediaFromUrl(sessionId, url),
      openUrl: (url: string) => admin.openUrl(sessionId, url),
    };
  },
  loadBaseline(admin, sessionId) {
    return admin.loadBaseline(sessionId);
  },
  async beforeStopRecording(sessionAdminCtx) {
    await sessionAdminCtx.shell("input keyevent WAKEUP");
    await sleep(200);
  },
};
