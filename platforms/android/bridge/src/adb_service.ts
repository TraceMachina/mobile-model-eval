/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import { Adb } from "@devicefarmer/adbkit";
import type DeviceClient from "@devicefarmer/adbkit/dist/src/adb/DeviceClient.js";

export class AdbService {
  private device: DeviceClient;
  readonly serial: string;

  constructor(serial: string) {
    const client = Adb.createClient();
    this.device = client.getDevice(serial);
    this.serial = serial;
  }

  async shell(command: string): Promise<string> {
    const stream = await this.device.shell(command);
    const buf = await Adb.util.readAll(stream);
    return buf.toString();
  }

  async tap(x: number, y: number): Promise<void> {
    await this.shell(`input tap ${x} ${y}`);
  }

  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number = 300,
  ): Promise<void> {
    await this.shell(`input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`);
  }

  async longPress(x: number, y: number, durationMs: number = 1000): Promise<void> {
    await this.shell(`input swipe ${x} ${y} ${x} ${y} ${durationMs}`);
  }

  async keyEvent(key: string): Promise<void> {
    const normalized = key === "LOCK" ? "POWER" : key;
    const keycode = normalized.startsWith("KEYCODE_")
      ? normalized
      : `KEYCODE_${normalized.toUpperCase()}`;
    await this.shell(`input keyevent ${keycode}`);
  }

  async screenshot(): Promise<Buffer> {
    const stream = await this.device.screencap();
    return await Adb.util.readAll(stream);
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    const output = (await this.shell("wm size")).trim();
    const match = output.match(/(\d+)x(\d+)/);
    const width = match?.[1];
    const height = match?.[2];
    return {
      width: width ? parseInt(width, 10) : 0,
      height: height ? parseInt(height, 10) : 0,
    };
  }

  async emuCommand(command: string): Promise<string> {
    const proc = Bun.spawn(["adb", "-s", this.serial, "emu", ...command.split(" ")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    if (exitCode !== 0 || stdout.includes("KO")) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`emu command failed: ${stdout.trim()} ${stderr.trim()}`);
    }
    return stdout;
  }

  async pushFile(localPath: string, destPath: string): Promise<void> {
    const proc = Bun.spawn(["adb", "-s", this.serial, "push", localPath, destPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`adb push failed: ${stderr.trim()}`);
    }
  }

  async saveSnapshot(name: string): Promise<void> {
    await this.emuCommand(`avd snapshot save ${name}`);
  }

  async loadSnapshot(name: string): Promise<void> {
    await this.emuCommand(`avd snapshot load ${name}`);
    await this.waitForDevice();
  }

  async deleteSnapshot(name: string): Promise<void> {
    await this.emuCommand(`avd snapshot delete ${name}`);
  }

  private async waitForDevice(): Promise<void> {
    const proc = Bun.spawn(["adb", "-s", this.serial, "wait-for-device"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  }
}
