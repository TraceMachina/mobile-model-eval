import { androidPlatform } from "./android/index.ts";
import { iosPlatform } from "./ios/index.ts";
import type { DevicePlatform, PlatformDefinition } from "./types.ts";

const platforms: Record<DevicePlatform, PlatformDefinition> = {
  android: androidPlatform,
  ios: iosPlatform,
};

export const availablePlatforms = Object.values(platforms);

export function getPlatform(id: string): PlatformDefinition {
  if (id === "android" || id === "ios") {
    return platforms[id];
  }

  const available = availablePlatforms.map((platform) => platform.id).join(", ");
  throw new Error(`Unknown platform: ${id}. Available platforms: ${available}`);
}
