/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { TestCase } from "../../../harness/types.ts";

export function makeVerificationCodeTest(): TestCase {
  const code = String(Math.floor(100000 + Math.random() * 900000));

  return {
    id: "get-verification-code",
    name: "Get verification code from text message",
    prompt:
      "You just received a text message with a verification code. Open the Messages app, find the verification code, and tell me what it is.",
    setup: [
      "input keyevent HOME",
      async (sessionAdminCtx) => {
        await sessionAdminCtx.platformCommand(
          `sms send 555-1234 Your verification code is ${code}. It expires in 10 minutes.`,
        );
      },
    ],
    verifications: [],
    rawOutputCheck: (rawOutput: string) => {
      const found = rawOutput.includes(code);
      return {
        pass: found,
        message: found
          ? `Model reported verification code ${code}`
          : `Model did not report verification code ${code} in output`,
      };
    },
    timeoutMs: 120_000,
    tags: ["android", "messaging", "verification"],
  };
}
