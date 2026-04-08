/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { DevicePlatform } from "../platforms/types.ts";

/** Session info returned by the admin API. */
export interface DeviceSessionInfo {
  deviceSessionId: string;
  platform: DevicePlatform;
  deviceId: string;
  deviceName?: string;
  screenWidth: number;
  screenHeight: number;
  screenshotUrl: string;
}

/**
 * HTTP client for the mobile bridge admin API.
 * Used by the harness for session lifecycle, setup, and verification.
 */
export class AdminClient {
  private baseUrl: string;

  constructor(adminUrl: string) {
    this.baseUrl = adminUrl.replace(/\/$/, "");
  }

  /** Create a new device session. */
  async initDeviceSession(): Promise<DeviceSessionInfo> {
    const res = await fetch(`${this.baseUrl}/initDeviceSession`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`initDeviceSession failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<DeviceSessionInfo>;
  }

  /** Run a shell command on the session's device. */
  async runShellCommand(deviceSessionId: string, command: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/runShellCommand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, command }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`runShellCommand failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as { output: string };
    return data.output;
  }

  /** Reset the session's device back to its baseline state. */
  async loadBaseline(deviceSessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/loadBaseline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`loadBaseline failed (${res.status}): ${body}`);
    }
  }

  /** Run a platform-native command for the session's device. */
  async runPlatformCommand(deviceSessionId: string, command: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/runPlatformCommand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, command }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`runPlatformCommand failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as { output: string };
    return data.output;
  }

  /** Download and install an app bundle or package from a URL. */
  async installAppFromUrl(deviceSessionId: string, url: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/installAppFromUrl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, url }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`installAppFromUrl failed (${res.status}): ${body}`);
    }
  }

  /** Download and add media to the device from a URL. */
  async addMediaFromUrl(deviceSessionId: string, url: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/addMediaFromUrl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, url }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`addMediaFromUrl failed (${res.status}): ${body}`);
    }
  }

  /** Ask the device to open a URL. */
  async openUrl(deviceSessionId: string, url: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/openUrl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, url }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openUrl failed (${res.status}): ${body}`);
    }
  }

  /** Start screen recording for a device session. */
  async startRecording(deviceSessionId: string, outputPath: string): Promise<{ startedAtMs: number }> {
    const res = await fetch(`${this.baseUrl}/startRecording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId, outputPath }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`startRecording failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<{ startedAtMs: number }>;
  }

  /** Stop screen recording for a device session. */
  async stopRecording(deviceSessionId: string): Promise<{ stoppedAtMs: number }> {
    const res = await fetch(`${this.baseUrl}/stopRecording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`stopRecording failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<{ stoppedAtMs: number }>;
  }

  /** Remove a device session and clean up its snapshot. */
  async removeDeviceSession(deviceSessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/removeDeviceSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceSessionId }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`removeDeviceSession failed (${res.status}): ${body}`);
    }
  }
}
