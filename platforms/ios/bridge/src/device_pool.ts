import { randomUUID } from "node:crypto";
import type { BridgeHandle } from "../../../shared/bridge/server.ts";
import { SimctlService, type SimulatorDescriptor } from "./simctl_service.ts";

export interface IOSSessionHandle extends BridgeHandle {
  simctl: SimctlService;
  dirty: boolean;
}

interface DeviceSession {
  udid: string;
  dirty: boolean;
}

interface DeviceState {
  udid: string;
  name: string;
  simctl: SimctlService;
  activeSessionId: string | null;
  opQueue: Promise<void>;
}

export class DevicePool {
  private devices: Map<string, DeviceState>;
  private sessions = new Map<string, DeviceSession>();

  constructor(simulators: SimulatorDescriptor[]) {
    this.devices = new Map(
      simulators.map((simulator) => [
        simulator.udid,
        {
          udid: simulator.udid,
          name: simulator.name,
          simctl: new SimctlService(simulator),
          activeSessionId: null,
          opQueue: Promise.resolve(),
        },
      ]),
    );
    console.error(
      `iOS DevicePool initialized with ${simulators.length} simulator(s): ${simulators.map((s) => `${s.name} (${s.udid})`).join(", ")}`,
    );
  }

  initializeSession(): { deviceSessionId: string; handle: IOSSessionHandle } {
    const id = randomUUID();
    const device = this.leastLoadedDevice();

    this.sessions.set(id, { udid: device.udid, dirty: false });
    console.error(`iOS session ${id} registered on ${device.name} (${device.udid})`);
    return {
      deviceSessionId: id,
      handle: {
        simctl: device.simctl,
        deviceId: device.udid,
        deviceName: device.name,
        dirty: false,
      },
    };
  }

  withSession<T>(
    deviceSessionId: string,
    fn: (handle: IOSSessionHandle) => Promise<T>,
  ): Promise<T> {
    const session = this.sessions.get(deviceSessionId);
    if (!session) {
      throw new Error("Unknown device session.");
    }

    const device = this.devices.get(session.udid)!;
    return this.withDeviceLock(device, async () => {
      device.activeSessionId = deviceSessionId;
      return fn({
        simctl: device.simctl,
        deviceId: device.udid,
        deviceName: device.name,
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

    const device = this.devices.get(session.udid);
    if (!device) {
      return;
    }

    await this.withDeviceLock(device, async () => {
      if (device.activeSessionId === deviceSessionId) {
        device.activeSessionId = null;
      }
    });

    this.sessions.delete(deviceSessionId);
    console.error(`iOS session ${deviceSessionId} removed`);
  }

  private leastLoadedDevice(): DeviceState {
    let best: DeviceState | null = null;
    let bestCount = Infinity;
    const counts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      counts.set(session.udid, (counts.get(session.udid) ?? 0) + 1);
    }
    for (const device of this.devices.values()) {
      const count = counts.get(device.udid) ?? 0;
      if (count < bestCount) {
        best = device;
        bestCount = count;
      }
    }
    return best!;
  }

  private withDeviceLock<T>(device: DeviceState, fn: () => Promise<T>): Promise<T> {
    const result = device.opQueue.then(fn, fn);
    device.opQueue = result.then(() => {}, () => {});
    return result;
  }
}
