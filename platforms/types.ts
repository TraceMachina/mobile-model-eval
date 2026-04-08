import type { AdminClient, DeviceSessionInfo } from "../harness/admin_client.ts";
import type { SessionAdminContext, TestCase } from "../harness/types.ts";

export type DevicePlatform = "android" | "ios";

export interface PlatformDefinition {
  id: DevicePlatform;
  displayName: string;
  mcpServerName: string;
  recordingExtension: string;
  tests: TestCase[];
  createSessionAdminContext(
    admin: AdminClient,
    sessionId: string,
    session: DeviceSessionInfo,
  ): SessionAdminContext;
  loadBaseline(admin: AdminClient, sessionId: string): Promise<void>;
  beforeStopRecording?(sessionAdminCtx: SessionAdminContext): Promise<void>;
}
