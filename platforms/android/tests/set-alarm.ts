/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { TestCase } from "../../../harness/types.ts";

export const setAlarm5pm: TestCase = {
  id: "set-alarm-5pm",
  name: "Set an alarm for 5:00 PM",
  prompt: "Set an alarm for 5:00 PM.",
  setup: [
    "am force-stop com.google.android.deskclock",
  ],
  verifications: [
    {
      name: "Clock app has a pending alarm for 17:00",
      command: "dumpsys alarm | sed '/Past-due/,$d' | grep -A2 'com.google.android.deskclock'",
      expected: (output: string) => {
        const has5pm = /17:00/.test(output);
        return {
          pass: has5pm,
          message: has5pm
            ? "Found 17:00 alarm in dumpsys"
            : `No 17:00 alarm found. Output: ${output}`,
        };
      },
    },
  ],
  timeoutMs: 120_000,
  tags: ["android", "clock", "alarm"],
};
