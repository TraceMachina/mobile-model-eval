/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { TestCase } from "../../../harness/types.ts";
import { packageInstalled } from "../checks.ts";

const FOCUS_APK_URL =
  "https://github.com/mozilla-mobile/focus-android/releases/download/v108.1.0/focus-108.1.0-x86_64.apk";
const FOCUS_PACKAGE = "org.mozilla.focus";

export const uninstallApp: TestCase = {
  id: "uninstall-app",
  name: "Uninstall the Firefox Focus app",
  prompt: [
    "There is an app called Firefox Focus installed on this device.",
    "The icon looks like the Firefox logo, but purple.",
    "Find it and uninstall it.",
  ].join(" "),
  setup: [
    async (ctx) => {
      const packages = await ctx.shell("pm list packages");
      if (packages.includes(FOCUS_PACKAGE)) {
        return;
      }
      await ctx.installAppFromUrl(FOCUS_APK_URL);
    },
  ],
  verifications: [packageInstalled(FOCUS_PACKAGE, false)],
  timeoutMs: 120_000,
  tags: ["android", "apps", "uninstall"],
};
