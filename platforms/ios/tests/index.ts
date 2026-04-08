import type { TestCase } from "../../../harness/types.ts";
import { increaseContrastOn, textSizeAccessibilityLarge } from "./accessibility.ts";
import { darkModeOff, darkModeOn } from "./appearance.ts";
import { uninstallTipsApp } from "./uninstall-app.ts";

export const iosTests: TestCase[] = [
  darkModeOn,
  darkModeOff,
  increaseContrastOn,
  textSizeAccessibilityLarge,
  uninstallTipsApp,
];
