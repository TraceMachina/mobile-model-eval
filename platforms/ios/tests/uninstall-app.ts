import type { TestCase } from "../../../harness/types.ts";
import { appInstalled } from "../checks.ts";

const TIPS_APP_BUNDLE_ID = "com.apple.tips";

export const uninstallTipsApp: TestCase = {
  id: "uninstall-tips-app",
  name: "Uninstall the Tips app",
  prompt: [
    "There is an app called Tips installed on this iPhone.",
    "Find it on the Home Screen and remove it.",
  ].join(" "),
  setup: [],
  verifications: [appInstalled(TIPS_APP_BUNDLE_ID, false)],
  timeoutMs: 120_000,
  tags: ["ios", "apps", "uninstall"],
};
