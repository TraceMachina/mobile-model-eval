import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import sharp from "sharp";

export interface SimulatorDescriptor {
  udid: string;
  name: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitCommand(command: string): string[] {
  const matches = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
  return matches.map((token) =>
    token.startsWith('"') || token.startsWith("'")
      ? token.slice(1, -1)
      : token,
  );
}

async function runCommand(
  args: string[],
  options: { stdout?: "text" | "buffer" } = {},
): Promise<string | Buffer> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(`${args.join(" ")} failed: ${stderr.trim()}`);
  }

  if (options.stdout === "buffer") {
    return Buffer.from(await new Response(proc.stdout).arrayBuffer());
  }

  return await new Response(proc.stdout).text();
}

async function downloadToTempFile(url: string): Promise<string> {
  const urlPath = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();
  const extension = extname(urlPath);
  const tmpPath = join(
    tmpdir(),
    `mobile-model-eval-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
  );
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

function findAppBundle(root: string): string | null {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app")) {
        return fullPath;
      }
      const nested = findAppBundle(fullPath);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

async function resolveInstallablePath(downloadPath: string): Promise<{ installPath: string; cleanupPaths: string[] }> {
  const cleanupPaths = [downloadPath];
  const extension = extname(downloadPath).toLowerCase();

  if (extension === ".app") {
    return { installPath: downloadPath, cleanupPaths };
  }

  if (extension === ".zip") {
    const extractDir = mkdtempSync(join(tmpdir(), "mobile-model-eval-ios-app-"));
    cleanupPaths.push(extractDir);
    await runCommand(["unzip", "-q", downloadPath, "-d", extractDir]);
    const appPath = findAppBundle(extractDir);
    if (!appPath) {
      throw new Error(`No .app bundle found in ${basename(downloadPath)}`);
    }
    return { installPath: appPath, cleanupPaths };
  }

  return { installPath: downloadPath, cleanupPaths };
}

export async function resolveSimulators(identifiers: string[]): Promise<SimulatorDescriptor[]> {
  const output = await runCommand(["xcrun", "simctl", "list", "devices", "available", "-j"]) as string;
  const parsed = JSON.parse(output) as {
    devices: Record<string, Array<{ udid: string; name: string; isAvailable?: boolean; state?: string }>>;
  };

  const allDevices = Object.values(parsed.devices)
    .flat()
    .filter((device) => device.isAvailable !== false);

  return identifiers.map((identifier) => {
    const exactMatches = allDevices.filter((device) =>
      device.udid === identifier || device.name === identifier,
    );

    if (exactMatches.length === 0) {
      throw new Error(`Unable to resolve iOS simulator identifier: ${identifier}`);
    }

    const preferred = exactMatches.find((device) => device.state === "Booted") ?? exactMatches[0];
    if (!preferred) {
      throw new Error(`Unable to resolve iOS simulator identifier: ${identifier}`);
    }
    return { udid: preferred.udid, name: preferred.name };
  });
}

export class SimctlService {
  readonly udid: string;
  readonly name: string;
  private screenSize?: { width: number; height: number };
  private static helperBinaryPromise: Promise<string> | null = null;

  constructor(simulator: SimulatorDescriptor) {
    this.udid = simulator.udid;
    this.name = simulator.name;
  }

  async shell(command: string): Promise<string> {
    return await runCommand([
      "xcrun",
      "simctl",
      "spawn",
      this.udid,
      "sh",
      "-lc",
      command,
    ]) as string;
  }

  async platformCommand(command: string): Promise<string> {
    const [subcommand, ...rest] = splitCommand(command);
    if (!subcommand) {
      throw new Error("simctl command required");
    }
    return await runCommand(["xcrun", "simctl", subcommand, this.udid, ...rest]) as string;
  }

  async screenshot(): Promise<Buffer> {
    return await runCommand(
      ["xcrun", "simctl", "io", this.udid, "screenshot", "--type=png", "-"],
      { stdout: "buffer" },
    ) as Buffer;
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.screenSize) {
      return this.screenSize;
    }
    const png = await this.screenshot();
    const metadata = await sharp(png).metadata();
    this.screenSize = {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    };
    return this.screenSize;
  }

  async tap(x: number, y: number): Promise<void> {
    await this.runInputHelper(["tap", String(x), String(y)]);
  }

  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs: number = 300,
  ): Promise<void> {
    await this.runInputHelper([
      "swipe",
      String(x1),
      String(y1),
      String(x2),
      String(y2),
      String(durationMs),
    ]);
  }

  async longPress(x: number, y: number, durationMs: number = 1000): Promise<void> {
    await this.runInputHelper([
      "long-press",
      String(x),
      String(y),
      String(durationMs),
    ]);
  }

  async keyEvent(key: string): Promise<void> {
    await this.runInputHelper(["key", key]);
  }

  async resetToBaseline(): Promise<void> {
    try {
      await runCommand(["xcrun", "simctl", "shutdown", this.udid]);
    } catch {
      // Ignore shutdown errors for already-shutdown devices.
    }
    await runCommand(["xcrun", "simctl", "erase", this.udid]);
    try {
      await runCommand(["xcrun", "simctl", "boot", this.udid]);
    } catch {
      // Ignore if already booted as part of erase flow.
    }
    await runCommand(["xcrun", "simctl", "bootstatus", this.udid, "-b"]);
    this.screenSize = undefined;
  }

  async installAppFromUrl(url: string): Promise<void> {
    const downloadedPath = await downloadToTempFile(url);
    let cleanupPaths: string[] = [downloadedPath];
    try {
      const resolved = await resolveInstallablePath(downloadedPath);
      cleanupPaths = resolved.cleanupPaths;
      await runCommand(["xcrun", "simctl", "install", this.udid, resolved.installPath]);
    } finally {
      for (const path of cleanupPaths) {
        try {
          const stat = statSync(path);
          if (stat.isDirectory()) {
            rmSync(path, { recursive: true, force: true });
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
        } catch {
          // Ignore cleanup failures.
        }
      }
    }
  }

  async addMediaFromUrl(url: string): Promise<void> {
    const downloadedPath = await downloadToTempFile(url);
    try {
      await runCommand(["xcrun", "simctl", "addmedia", this.udid, downloadedPath]);
    } finally {
      try {
        unlinkSync(downloadedPath);
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  async openUrl(url: string): Promise<void> {
    await runCommand(["xcrun", "simctl", "openurl", this.udid, url]);
  }

  private async activateSimulatorWindow(): Promise<void> {
    await runCommand(["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", this.udid]);
    await sleep(250);
  }

  private async runInputHelper(commandArgs: string[]): Promise<void> {
    await this.activateSimulatorWindow();
    const screenSize = await this.getScreenSize();
    const helperBinary = await SimctlService.getHelperBinaryPath();
    await runCommand([
      helperBinary,
      "--app-name",
      process.env.IOS_SIMULATOR_APP_NAME ?? "Simulator",
      "--window-match",
      this.name,
      "--screen-width",
      String(screenSize.width),
      "--screen-height",
      String(screenSize.height),
      ...commandArgs,
    ]);
  }

  private static async getHelperBinaryPath(): Promise<string> {
    if (!this.helperBinaryPromise) {
      this.helperBinaryPromise = (async () => {
        const sourcePath = new URL("../scripts/simulator_input.swift", import.meta.url).pathname;
        const outputPath = join(tmpdir(), "mobile-model-eval-simulator-input");
        await runCommand([
          "xcrun",
          "swiftc",
          sourcePath,
          "-o",
          outputPath,
        ]);
        return outputPath;
      })();
    }
    return await this.helperBinaryPromise;
  }
}
