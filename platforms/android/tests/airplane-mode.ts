/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { TestCase } from "../../../harness/types.ts";

export const airplaneModeOn: TestCase = {
  id: "airplane-mode-on",
  name: "Turn on airplane mode",
  prompt: "Turn on airplane mode.",
  setup: [
    "cmd connectivity airplane-mode disable",
  ],
  verifications: [
    {
      name: "airplane_mode_on is 1",
      command: "settings get global airplane_mode_on",
      expected: "1",
    },
  ],
  timeoutMs: 90_000,
  tags: ["android", "settings", "connectivity"],
};

export const airplaneModeOff: TestCase = {
  id: "airplane-mode-off",
  name: "Turn off airplane mode",
  prompt: "Turn off airplane mode.",
  setup: [
    "cmd connectivity airplane-mode enable",
  ],
  verifications: [
    {
      name: "airplane_mode_on is 0",
      command: "settings get global airplane_mode_on",
      expected: "0",
    },
  ],
  timeoutMs: 90_000,
  tags: ["android", "settings", "connectivity"],
};
