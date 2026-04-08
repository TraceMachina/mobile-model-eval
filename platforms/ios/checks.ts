import type { VerificationCheck, VerificationResult } from "../../harness/types.ts";

export function simulatorCommandEquals(
  name: string,
  command: string,
  expectedValue: string,
): VerificationCheck {
  return {
    name,
    command: async (ctx) => ctx.platformCommand(command),
    expected: expectedValue,
  };
}

export function simulatorCommandMatches(
  name: string,
  command: string,
  pattern: RegExp,
): VerificationCheck {
  return {
    name,
    command: async (ctx) => ctx.platformCommand(command),
    expected: pattern,
  };
}

export function appInstalled(
  bundleId: string,
  shouldExist: boolean = true,
): VerificationCheck {
  return {
    name: shouldExist
      ? `${bundleId} is installed`
      : `${bundleId} is not installed`,
    command: async (ctx) => ctx.platformCommand("listapps"),
    expected: (output: string): VerificationResult => {
      const found = output.includes(bundleId);
      if (shouldExist) {
        return {
          pass: found,
          message: found
            ? `App ${bundleId} is installed`
            : `App ${bundleId} not found`,
        };
      }
      return {
        pass: !found,
        message: found
          ? `App ${bundleId} is still installed`
          : `App ${bundleId} was removed`,
      };
    },
  };
}
