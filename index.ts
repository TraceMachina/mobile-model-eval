/*
 * SPDX-License-Identifier: Apache-2.0
 * Derived from the original Android model evaluation code and modified by Trace Machina.
 * See /NOTICE and /licenses/APACHE-2.0.txt.
 */
import { parseArgs } from "node:util";
import { runTests } from "./harness/runner.ts";
import { printSummary, writeJsonReport } from "./harness/reporter.ts";
import { AdminClient } from "./harness/admin_client.ts";
import { CodexProvider } from "./harness/providers/codex.ts";
import { ClaudeProvider } from "./harness/providers/claude.ts";
import { GeminiProvider } from "./harness/providers/gemini.ts";
import type { LlmProvider } from "./harness/providers/types.ts";
import { getPlatform } from "./platforms/index.ts";

const { values } = parseArgs({
  options: {
    platform: { type: "string", default: "android" },
    provider: { type: "string", default: "codex" },
    model: { type: "string" },
    "mcp-url": { type: "string", default: "http://localhost:3000" },
    "admin-url": { type: "string", default: "http://localhost:3001" },
    effort: { type: "string" },
    timeout: { type: "string" },
    test: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`Usage: bun run index.ts [options]

Options:
  --platform <name>    Mobile platform: android, ios              (default: android)
  --provider <name>    LLM provider: codex, claude, gemini (default: codex)
  --model <model>      Model override (e.g. o4-mini, sonnet, opus)
  --mcp-url <url>      MCP server URL (default: http://localhost:3000)
  --admin-url <url>    Admin API URL (default: http://localhost:3001)
  --effort <level>     Reasoning effort level (e.g. low, medium, high, max)
  --test <id>          Run only this test (e.g. set-alarm-5pm, airplane-mode-on)
  --timeout <ms>       Per-test timeout in milliseconds
  -h, --help           Show this help
`);
  process.exit(0);
}

const mcpUrl = values["mcp-url"]!;
const platform = getPlatform(values.platform!);

const effort = values.effort;

function createProvider(name: string, model?: string): LlmProvider {
  switch (name) {
    case "codex":
      return new CodexProvider({
        model,
        mcpServerUrl: mcpUrl,
        mcpServerName: platform.mcpServerName,
        effort,
      });
    case "claude":
      return new ClaudeProvider({
        model,
        mcpServerUrl: mcpUrl,
        mcpServerName: platform.mcpServerName,
        effort,
      });
    case "gemini":
      return new GeminiProvider({
        model,
        mcpServerUrl: mcpUrl,
        mcpServerName: platform.mcpServerName,
      });
    default:
      console.error(`Unknown provider: ${name}`);
      console.error("Available providers: codex, claude, gemini");
      process.exit(1);
  }
}

let tests = platform.tests;
if (values.test) {
  tests = tests.filter((t) => t.id === values.test);
  if (tests.length === 0) {
    console.error(`Unknown test: ${values.test}`);
    console.error("Available tests: " + platform.tests.map((t) => t.id).join(", "));
    process.exit(1);
  }
}
if (values.timeout) {
  const ms = parseInt(values.timeout, 10);
  tests = tests.map((t) => ({ ...t, timeoutMs: ms }));
}

const provider = createProvider(values.provider!, values.model);
const admin = new AdminClient(values["admin-url"]!);

console.log(`Platform: ${platform.displayName}`);
console.log(`Provider: ${provider.name}`);
console.log(`MCP Server: ${mcpUrl}`);
console.log(`Tests: ${tests.length}`);

// Provider-specific setup (codex needs MCP server registration)
if ("setup" in provider && typeof provider.setup === "function") {
  await provider.setup();
}

try {
  const model = values.model ?? (
    values.provider === "claude" ? "sonnet" :
    values.provider === "gemini" ? "gemini-2.5-pro" :
    "gpt-5.4"
  );
  const summary = await runTests(
    tests,
    provider,
    platform,
    { mcpServerUrl: mcpUrl, admin, model, effort },
  );
  printSummary(summary);
  await writeJsonReport(summary);
  process.exit(summary.failed > 0 ? 1 : 0);
} finally {
  if ("teardown" in provider && typeof provider.teardown === "function") {
    await provider.teardown();
  }
}
