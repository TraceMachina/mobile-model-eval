/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import type { TestCase } from "../../../harness/types.ts";
import { airplaneModeOff, airplaneModeOn } from "./airplane-mode.ts";
import { setAlarm5pm } from "./set-alarm.ts";
import { uninstallApp } from "./uninstall-app.ts";

export const androidTests: TestCase[] = [
  airplaneModeOn,
  airplaneModeOff,
  setAlarm5pm,
  uninstallApp,
];
