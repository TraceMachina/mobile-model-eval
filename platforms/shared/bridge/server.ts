import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import sharp from "sharp";
import { z } from "zod";
import type { DevicePlatform } from "../../types.ts";

const buttonKeys = [
  "HOME",
  "BACK",
  "POWER",
  "LOCK",
  "VOLUME_UP",
  "VOLUME_DOWN",
] as const;

export type ButtonKey = (typeof buttonKeys)[number];

interface SessionInfo {
  [key: string]: unknown;
  deviceSessionId: string;
  platform: DevicePlatform;
  deviceId: string;
  deviceName?: string;
  screenWidth: number;
  screenHeight: number;
  screenshotUrl: string;
  timestamp_ms: number;
}

export interface BridgeHandle {
  deviceId: string;
  deviceName?: string;
}

export interface BridgePool<THandle extends BridgeHandle> {
  initializeSession(): { deviceSessionId: string; handle: THandle };
  withSession<T>(deviceSessionId: string, fn: (handle: THandle) => Promise<T>): Promise<T>;
  markDirty(deviceSessionId: string): void;
  removeSession(deviceSessionId: string): Promise<void>;
}

export interface BridgePlatformAdapter<THandle extends BridgeHandle> {
  platform: DevicePlatform;
  serverName: string;
  pool: BridgePool<THandle>;
  getScreenSize(handle: THandle): Promise<{ width: number; height: number }>;
  screenshot(handle: THandle): Promise<Buffer>;
  tap(handle: THandle, x: number, y: number): Promise<void>;
  swipe(
    handle: THandle,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number,
  ): Promise<void>;
  longPress(handle: THandle, x: number, y: number, durationMs: number): Promise<void>;
  keyEvent(handle: THandle, key: ButtonKey): Promise<void>;
  shell(handle: THandle, command: string): Promise<string>;
  platformCommand(handle: THandle, command: string): Promise<string>;
  loadBaseline(handle: THandle): Promise<void>;
  installAppFromUrl?(handle: THandle, url: string): Promise<void>;
  addMediaFromUrl?(handle: THandle, url: string): Promise<void>;
  openUrl?(handle: THandle, url: string): Promise<void>;
  startRecording(
    deviceSessionId: string,
    handle: THandle,
    outputPath: string,
  ): Promise<{ startedAtMs: number }>;
  stopRecording(deviceSessionId: string): Promise<{ stoppedAtMs: number }>;
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function createBridgeServer<THandle extends BridgeHandle>(
  adapter: BridgePlatformAdapter<THandle>,
  { port, adminPort }: { port: number; adminPort: number },
) {
  const sessionInfoSchema = {
    deviceSessionId: z.string(),
    platform: z.enum(["android", "ios"]),
    deviceId: z.string(),
    deviceName: z.string().optional(),
    screenWidth: z.number(),
    screenHeight: z.number(),
    screenshotUrl: z.string().describe(
      "GET this URL to retrieve a live PNG screenshot. Supports optional query params: x, y, width, height (crop region, width/height max 500px) and scale (0.0-1.0, applied after crop).",
    ),
    timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds when this request was handled"),
  };

  async function buildSessionInfo(
    deviceSessionId: string,
    handle: THandle,
    timestamp_ms: number,
  ): Promise<SessionInfo> {
    const { width, height } = await adapter.getScreenSize(handle);
    return {
      deviceSessionId,
      platform: adapter.platform,
      deviceId: handle.deviceId,
      deviceName: handle.deviceName,
      screenWidth: width,
      screenHeight: height,
      screenshotUrl: `http://localhost:${port}/screenshot/${deviceSessionId}`,
      timestamp_ms,
    };
  }

  function createMcpServer(): McpServer {
    const server = new McpServer({
      name: adapter.serverName,
      version: "1.0.0",
    });

    server.registerTool(
      "get-device-session-info",
      {
        description: "Get session info for an existing mobile device session.",
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
        },
        outputSchema: sessionInfoSchema,
      },
      async ({ deviceSessionId }) => {
        const structuredContent = await adapter.pool.withSession(deviceSessionId, (handle) =>
          buildSessionInfo(deviceSessionId, handle, Date.now()),
        );
        return { content: [], structuredContent };
      },
    );

    server.registerTool(
      "screenshot",
      {
        description: [
          "Capture a region of the screen as a PNG image. Two-step process:",
          "1) CROP: Extract the rectangle from (x, y) to (x+width, y+height) in device pixels.",
          "2) SCALE: Resize the cropped image by the scale factor.",
          "The returned image dimensions are (width*scale) x (height*scale) pixels.",
          "Use small scale values (0.25) for overview, larger (0.5-1.0) for text or fine details.",
        ].join(" "),
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
          x: z.number().describe("Left edge of crop region in device pixels."),
          y: z.number().describe("Top edge of crop region in device pixels."),
          width: z.number().max(512).describe("Width of crop region in device pixels. Max 512."),
          height: z.number().max(512).describe("Height of crop region in device pixels. Max 512."),
          scale: z.number().optional().default(0.25).describe("Downscale factor applied after cropping."),
        },
      },
      async ({ deviceSessionId, x, y, width, height, scale }) => {
        const timestamp_ms = Date.now();
        let png = await adapter.pool.withSession(deviceSessionId, (handle) =>
          adapter.screenshot(handle),
        );

        const hasCrop = x != null && y != null && width != null && height != null;
        const hasScale = scale != null;

        if (hasCrop || hasScale) {
          let pipeline = sharp(png);

          if (hasCrop) {
            pipeline = pipeline.extract({
              left: Math.round(x),
              top: Math.round(y),
              width: Math.round(width),
              height: Math.round(height),
            });
          }

          if (hasScale && scale < 1.0) {
            const srcWidth = hasCrop ? width : (await sharp(png).metadata()).width!;
            pipeline = pipeline.resize({
              width: Math.round(srcWidth * scale),
              withoutEnlargement: true,
            });
          }

          png = await pipeline.png().toBuffer();
        }

        return {
          content: [
            { type: "text", text: JSON.stringify({ timestamp_ms }) },
            { type: "image", data: png.toString("base64"), mimeType: "image/png" },
          ],
        };
      },
    );

    server.registerTool(
      "sleep",
      {
        description: "Wait briefly for UI animations or delayed actions to complete before taking another screenshot.",
        inputSchema: {
          durationMs: z.number().max(25).optional().default(10).describe("Duration to wait in milliseconds (default 10, max 25)"),
        },
        outputSchema: {
          success: z.boolean(),
          timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds"),
        },
      },
      async ({ durationMs }) => {
        const timestamp_ms = Date.now();
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        return { content: [], structuredContent: { success: true, timestamp_ms } };
      },
    );

    server.registerTool(
      "tap",
      {
        description: "Tap a screen coordinate",
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
          x: z.number().describe("X coordinate"),
          y: z.number().describe("Y coordinate"),
        },
        outputSchema: {
          success: z.boolean(),
          timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds"),
        },
      },
      async ({ deviceSessionId, x, y }) => {
        const timestamp_ms = await adapter.pool.withSession(deviceSessionId, async (handle) => {
          const ts = Date.now();
          await adapter.tap(handle, x, y);
          return ts;
        });
        adapter.pool.markDirty(deviceSessionId);
        return { content: [], structuredContent: { success: true, timestamp_ms } };
      },
    );

    server.registerTool(
      "swipe",
      {
        description: "Swipe from one point to another",
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
          x1: z.number().describe("Start X"),
          y1: z.number().describe("Start Y"),
          x2: z.number().describe("End X"),
          y2: z.number().describe("End Y"),
          durationMs: z.number().optional().default(300).describe("Swipe duration in milliseconds"),
        },
        outputSchema: {
          success: z.boolean(),
          timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds"),
        },
      },
      async ({ deviceSessionId, x1, y1, x2, y2, durationMs }) => {
        const timestamp_ms = await adapter.pool.withSession(deviceSessionId, async (handle) => {
          const ts = Date.now();
          await adapter.swipe(handle, x1, y1, x2, y2, durationMs);
          return ts;
        });
        adapter.pool.markDirty(deviceSessionId);
        return { content: [], structuredContent: { success: true, timestamp_ms } };
      },
    );

    server.registerTool(
      "long-press",
      {
        description: "Long-press (tap and hold) at a screen coordinate",
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
          x: z.number().describe("X coordinate"),
          y: z.number().describe("Y coordinate"),
          durationMs: z.number().optional().default(1000).describe("Hold duration in milliseconds"),
        },
        outputSchema: {
          success: z.boolean(),
          timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds"),
        },
      },
      async ({ deviceSessionId, x, y, durationMs }) => {
        const timestamp_ms = await adapter.pool.withSession(deviceSessionId, async (handle) => {
          const ts = Date.now();
          await adapter.longPress(handle, x, y, durationMs);
          return ts;
        });
        adapter.pool.markDirty(deviceSessionId);
        return { content: [], structuredContent: { success: true, timestamp_ms } };
      },
    );

    server.registerTool(
      "key-event",
      {
        description: "Press a physical button on the device",
        inputSchema: {
          deviceSessionId: z.string().describe("Device Session ID"),
          key: z.enum(buttonKeys).describe("Physical button on the device"),
        },
        outputSchema: {
          success: z.boolean(),
          keycode: z.string(),
          timestamp_ms: z.number().describe("Server-side epoch timestamp in milliseconds"),
        },
      },
      async ({ deviceSessionId, key }) => {
        const timestamp_ms = await adapter.pool.withSession(deviceSessionId, async (handle) => {
          const ts = Date.now();
          await adapter.keyEvent(handle, key);
          return ts;
        });
        adapter.pool.markDirty(deviceSessionId);
        return { content: [], structuredContent: { success: true, keycode: key, timestamp_ms } };
      },
    );

    return server;
  }

  Bun.serve({
    port,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url);
      const screenshotMatch = url.pathname.match(/^\/screenshot\/([a-f0-9-]+)$/);

      if (screenshotMatch && req.method === "GET") {
        try {
          const deviceSessionId = screenshotMatch[1];
          if (!deviceSessionId) {
            return new Response("Invalid device session", { status: 400 });
          }

          let png: Buffer = await adapter.pool.withSession(deviceSessionId, (handle) =>
            adapter.screenshot(handle),
          );

          const x = url.searchParams.has("x") ? Number(url.searchParams.get("x")) : null;
          const y = url.searchParams.has("y") ? Number(url.searchParams.get("y")) : null;
          const width = url.searchParams.has("width") ? Number(url.searchParams.get("width")) : null;
          const height = url.searchParams.has("height") ? Number(url.searchParams.get("height")) : null;
          const scale = url.searchParams.has("scale") ? Number(url.searchParams.get("scale")) : null;

          const hasCrop = x !== null && y !== null && width !== null && height !== null;
          const hasScale = scale !== null;

          if (hasCrop || hasScale) {
            if (hasCrop) {
              if (
                Number.isNaN(x) ||
                Number.isNaN(y) ||
                Number.isNaN(width) ||
                Number.isNaN(height) ||
                x < 0 ||
                y < 0 ||
                width <= 0 ||
                height <= 0 ||
                width > 500 ||
                height > 500
              ) {
                return new Response(
                  "Invalid crop: need x >= 0, y >= 0, 0 < width <= 500, 0 < height <= 500",
                  { status: 400 },
                );
              }
            }
            if (hasScale && (Number.isNaN(scale) || scale <= 0 || scale > 1.0)) {
              return new Response("Invalid scale: must be between 0.0 (exclusive) and 1.0", { status: 400 });
            }

            let pipeline = sharp(png);

            if (hasCrop) {
              pipeline = pipeline.extract({
                left: Math.round(x!),
                top: Math.round(y!),
                width: Math.round(width!),
                height: Math.round(height!),
              });
            }

            if (hasScale && scale! < 1.0) {
              const srcWidth = hasCrop ? width! : (await sharp(png).metadata()).width!;
              pipeline = pipeline.resize({
                width: Math.round(srcWidth * scale!),
                withoutEnlargement: true,
              });
            }

            png = await pipeline.png().toBuffer();
          }

          return new Response(new Uint8Array(png), {
            headers: { "Content-Type": "image/png" },
          });
        } catch (err: any) {
          if (err.message?.includes("Unknown device session")) {
            return new Response("Unknown device session", { status: 404 });
          }
          return new Response(`Screenshot error: ${err.message}`, { status: 500 });
        }
      }

      const transport = new WebStandardStreamableHTTPServerTransport();
      const server = createMcpServer();
      await server.connect(transport);
      return transport.handleRequest(req);
    },
  });

  Bun.serve({
    port: adminPort,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url);

      try {
        switch (url.pathname) {
          case "/initDeviceSession": {
            const { deviceSessionId, handle } = adapter.pool.initializeSession();
            const info = await buildSessionInfo(deviceSessionId, handle, Date.now());
            return jsonResponse(info);
          }
          case "/runShellCommand": {
            const body = await req.json() as { deviceSessionId: string; command: string };
            if (!body.deviceSessionId || !body.command) {
              return jsonResponse({ error: "deviceSessionId and command required" }, 400);
            }
            const output = await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.shell(handle, body.command),
            );
            adapter.pool.markDirty(body.deviceSessionId);
            return jsonResponse({ output });
          }
          case "/runPlatformCommand": {
            const body = await req.json() as { deviceSessionId: string; command: string };
            if (!body.deviceSessionId || !body.command) {
              return jsonResponse({ error: "deviceSessionId and command required" }, 400);
            }
            const output = await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.platformCommand(handle, body.command),
            );
            return jsonResponse({ output });
          }
          case "/loadBaseline": {
            const body = await req.json() as { deviceSessionId: string };
            if (!body.deviceSessionId) {
              return jsonResponse({ error: "deviceSessionId required" }, 400);
            }
            await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.loadBaseline(handle),
            );
            return jsonResponse({ success: true });
          }
          case "/installAppFromUrl": {
            if (!adapter.installAppFromUrl) {
              return jsonResponse({ error: "installAppFromUrl is not supported on this platform" }, 400);
            }
            const body = await req.json() as { deviceSessionId: string; url: string };
            if (!body.deviceSessionId || !body.url) {
              return jsonResponse({ error: "deviceSessionId and url required" }, 400);
            }
            await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.installAppFromUrl!(handle, body.url),
            );
            return jsonResponse({ success: true });
          }
          case "/addMediaFromUrl": {
            if (!adapter.addMediaFromUrl) {
              return jsonResponse({ error: "addMediaFromUrl is not supported on this platform" }, 400);
            }
            const body = await req.json() as { deviceSessionId: string; url: string };
            if (!body.deviceSessionId || !body.url) {
              return jsonResponse({ error: "deviceSessionId and url required" }, 400);
            }
            await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.addMediaFromUrl!(handle, body.url),
            );
            return jsonResponse({ success: true });
          }
          case "/openUrl": {
            if (!adapter.openUrl) {
              return jsonResponse({ error: "openUrl is not supported on this platform" }, 400);
            }
            const body = await req.json() as { deviceSessionId: string; url: string };
            if (!body.deviceSessionId || !body.url) {
              return jsonResponse({ error: "deviceSessionId and url required" }, 400);
            }
            await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.openUrl!(handle, body.url),
            );
            return jsonResponse({ success: true });
          }
          case "/startRecording": {
            const body = await req.json() as { deviceSessionId: string; outputPath: string };
            if (!body.deviceSessionId || !body.outputPath) {
              return jsonResponse({ error: "deviceSessionId and outputPath required" }, 400);
            }
            const recordResult = await adapter.pool.withSession(body.deviceSessionId, (handle) =>
              adapter.startRecording(body.deviceSessionId, handle, body.outputPath),
            );
            return jsonResponse(recordResult);
          }
          case "/stopRecording": {
            const body = await req.json() as { deviceSessionId: string };
            if (!body.deviceSessionId) {
              return jsonResponse({ error: "deviceSessionId required" }, 400);
            }
            const stopResult = await adapter.stopRecording(body.deviceSessionId);
            return jsonResponse(stopResult);
          }
          case "/removeDeviceSession": {
            const body = await req.json() as { deviceSessionId: string };
            if (!body.deviceSessionId) {
              return jsonResponse({ error: "deviceSessionId required" }, 400);
            }
            try {
              await adapter.stopRecording(body.deviceSessionId);
            } catch {
              // No active recording; ignore.
            }
            await adapter.pool.removeSession(body.deviceSessionId);
            return jsonResponse({ success: true });
          }
          default:
            return jsonResponse({ error: "Not found" }, 404);
        }
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    },
  });

  console.error(
    `${adapter.serverName} (${adapter.platform}) listening on http://localhost:${port} (MCP), http://localhost:${adminPort} (admin)`,
  );
}
