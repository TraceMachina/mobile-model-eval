import type { PlatformDefinition } from "../types.ts";
import { iosTests } from "./tests/index.ts";

export const iosPlatform: PlatformDefinition = {
  id: "ios",
  displayName: "iOS Simulator",
  mcpServerName: "mobile-mcp-bridge",
  recordingExtension: "mp4",
  tests: iosTests,
  createSessionAdminContext(admin, sessionId, session) {
    return {
      platform: "ios",
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
};
