import type { TestCase } from "../../../harness/types.ts";
import { simulatorCommandEquals } from "../checks.ts";

export const darkModeOn: TestCase = {
  id: "dark-mode-on",
  name: "Turn on Dark Mode",
  prompt: "Turn on Dark Mode on this iPhone.",
  setup: [
    async (ctx) => {
      await ctx.platformCommand("ui appearance light");
    },
  ],
  verifications: [
    simulatorCommandEquals("UI appearance is dark", "ui appearance", "dark"),
  ],
  timeoutMs: 90_000,
  tags: ["ios", "settings", "appearance"],
};

export const darkModeOff: TestCase = {
  id: "dark-mode-off",
  name: "Turn off Dark Mode",
  prompt: "Turn off Dark Mode on this iPhone.",
  setup: [
    async (ctx) => {
      await ctx.platformCommand("ui appearance dark");
    },
  ],
  verifications: [
    simulatorCommandEquals("UI appearance is light", "ui appearance", "light"),
  ],
  timeoutMs: 90_000,
  tags: ["ios", "settings", "appearance"],
};
