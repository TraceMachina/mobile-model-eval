/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import { randomUUID } from "node:crypto";
import { AdbService } from "./adb_service.ts";
import type { BridgeHandle } from "../../../shared/bridge/server.ts";

export interface AndroidSessionHandle extends BridgeHandle {
  adb: AdbService;
  dirty: boolean;
}

interface DeviceSession {
  serial: string;
  snapshotName: string | null;
  dirty: boolean;
}

interface DeviceState {
  serial: string;
  adb: AdbService;
  activeSessionId: string | null;
  opQueue: Promise<void>;
}

export class DevicePool {
  private devices: Map<string, DeviceState>;
  private sessions = new Map<string, DeviceSession>();

  constructor(serials: string[]) {
    this.devices = new Map(
      serials.map((serial) => [
        serial,
        {
          serial,
          adb: new AdbService(serial),
          activeSessionId: null,
          opQueue: Promise.resolve(),
        },
      ]),
    );
    console.error(`Android DevicePool initialized with ${serials.length} device(s): ${serials.join(", ")}`);
  }

  initializeSession(): { deviceSessionId: string; handle: AndroidSessionHandle } {
    const id = randomUUID();
    const device = this.leastLoadedDevice();

    this.sessions.set(id, { serial: device.serial, snapshotName: null, dirty: false });
    console.error(`Android session ${id} registered on ${device.serial}`);
    return {
      deviceSessionId: id,
      handle: {
        adb: device.adb,
        deviceId: device.serial,
        deviceName: device.serial,
        dirty: false,
      },
    };
  }

  withSession<T>(
    deviceSessionId: string,
    fn: (handle: AndroidSessionHandle) => Promise<T>,
  ): Promise<T> {
    const session = this.sessions.get(deviceSessionId);
    if (!session) {
      throw new Error("Unknown device session.");
    }

    const device = this.devices.get(session.serial)!;
    return this.withDeviceLock(device, async () => {
      await this.swapTo(device, deviceSessionId);
      return fn({
        adb: device.adb,
        deviceId: device.serial,
        deviceName: device.serial,
        dirty: session.dirty,
      });
    });
  }

  markDirty(deviceSessionId: string): void {
    const session = this.sessions.get(deviceSessionId);
    if (session) {
      session.dirty = true;
    }
  }

  async removeSession(deviceSessionId: string): Promise<void> {
    const session = this.sessions.get(deviceSessionId);
    if (!session) {
      return;
    }

    const device = this.devices.get(session.serial);
    if (!device) {
      return;
    }

    await this.withDeviceLock(device, async () => {
      if (device.activeSessionId === deviceSessionId) {
        device.activeSessionId = null;
      }

      if (session.snapshotName) {
        try {
          await device.adb.deleteSnapshot(session.snapshotName);
          console.error(`Deleted Android snapshot ${session.snapshotName} on ${session.serial}`);
        } catch (err) {
          console.error(`Failed to delete Android snapshot ${session.snapshotName}:`, err);
        }
      }
    });

    this.sessions.delete(deviceSessionId);
    console.error(`Android session ${deviceSessionId} removed`);
  }

  private leastLoadedDevice(): DeviceState {
    let best: DeviceState | null = null;
    let bestCount = Infinity;
    const counts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      counts.set(session.serial, (counts.get(session.serial) ?? 0) + 1);
    }
    for (const device of this.devices.values()) {
      const count = counts.get(device.serial) ?? 0;
      if (count < bestCount) {
        best = device;
        bestCount = count;
      }
    }
    return best!;
  }

  private async swapTo(device: DeviceState, targetSessionId: string): Promise<void> {
    if (device.activeSessionId === targetSessionId) {
      return;
    }

    if (device.activeSessionId) {
      const currentSession = this.sessions.get(device.activeSessionId);
      if (currentSession?.dirty) {
        const snapshotName = `mcp-session-${device.activeSessionId}`;
        console.error(`Swapping out Android session ${device.activeSessionId}: saving ${snapshotName}`);
        await device.adb.saveSnapshot(snapshotName);
        currentSession.snapshotName = snapshotName;
        currentSession.dirty = false;
      }
    }

    const targetSession = this.sessions.get(targetSessionId);
    if (targetSession?.snapshotName) {
      console.error(`Swapping in Android session ${targetSessionId}: loading ${targetSession.snapshotName}`);
      await device.adb.loadSnapshot(targetSession.snapshotName);
    }

    device.activeSessionId = targetSessionId;
  }

  private withDeviceLock<T>(device: DeviceState, fn: () => Promise<T>): Promise<T> {
    const result = device.opQueue.then(fn, fn);
    device.opQueue = result.then(() => {}, () => {});
    return result;
  }
}
