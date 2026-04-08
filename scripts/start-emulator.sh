#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Derived from the original Android model evaluation code and modified by Trace Machina.
# See /NOTICE and /licenses/APACHE-2.0.txt.
set -euo pipefail

exec "$(cd "$(dirname "$0")" && pwd)/start-android-emulator.sh" "$@"
