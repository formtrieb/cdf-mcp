import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerCoverageProfileTool } from "../src/tools/coverage-profile.js";

const PROFILE_WITH_ORPHAN = `
name: CovTest
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: x
vocabularies:
  hierarchy: { description: x, values: [primary, secondary, tertiary] }
token_grammar:
  g1: { pattern: "color.{hierarchy}", dtcg_type: color, description: x }
theming:
  modifiers: {}
  set_mapping: {}
naming:
  css_prefix: "ct-"
  token_prefix: "--ct-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

function buildTool(tempDir: string) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_coverage_profile") handler = fn;
    return orig(name, def, fn);
  };
  registerCoverageProfileTool(server, [tempDir]);
  if (!handler) throw new Error("cdf_coverage_profile handler not captured");
  return handler;
}

describe("cdf_coverage_profile", () => {
  let tempDir: string;
  let invoke: ReturnType<typeof buildTool>;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdf-mcp-cov-"));
    writeFileSync(join(tempDir, "cov.profile.yaml"), PROFILE_WITH_ORPHAN);
    invoke = buildTool(tempDir);
  });

  it("returns orphans + checks_run + checks_skipped with 0 components", async () => {
    const result = await invoke({ profile: "cov" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.components_considered).toBe(0);
    expect(parsed.checks_run).toEqual(["vocab-orphan"]);
    expect(parsed.checks_skipped.length).toBe(2);
    expect(parsed.orphans.length).toBeGreaterThanOrEqual(3); // all 3 hierarchy values orphan under strict
  });

  it("accepts profile_yaml inline input", async () => {
    const result = await invoke({
      profile_yaml: PROFILE_WITH_ORPHAN,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.orphans.length).toBeGreaterThanOrEqual(3);
  });

  it("errors when neither profile nor profile_yaml provided", async () => {
    const result = await invoke({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/either profile or profile_yaml/i);
  });
});
