import type { TestCase } from "../../../harness/types.ts";
import { simulatorCommandEquals } from "../checks.ts";

export const increaseContrastOn: TestCase = {
  id: "increase-contrast-on",
  name: "Enable Increase Contrast",
  prompt: "Enable the Increase Contrast accessibility setting.",
  setup: [
    async (ctx) => {
      await ctx.platformCommand("ui increase_contrast disabled");
    },
  ],
  verifications: [
    simulatorCommandEquals(
      "Increase Contrast is enabled",
      "ui increase_contrast",
      "enabled",
    ),
  ],
  timeoutMs: 90_000,
  tags: ["ios", "settings", "accessibility"],
};

export const textSizeAccessibilityLarge: TestCase = {
  id: "content-size-accessibility-large",
  name: "Set text size to Accessibility Large",
  prompt: "Set the preferred text size to Accessibility Large in Settings.",
  setup: [
    async (ctx) => {
      await ctx.platformCommand("ui content_size medium");
    },
  ],
  verifications: [
    simulatorCommandEquals(
      "Preferred content size is Accessibility Large",
      "ui content_size",
      "accessibility-large",
    ),
  ],
  timeoutMs: 120_000,
  tags: ["ios", "settings", "accessibility"],
};
