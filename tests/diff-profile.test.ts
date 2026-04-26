import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDiffProfileTool } from "../src/tools/diff-profile.js";

const PROFILE_A = `
name: A
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: x
vocabularies:
  hierarchy: { description: x, values: [primary, secondary] }
token_grammar:
  g1: { pattern: "c.{hierarchy}", dtcg_type: color, description: x }
theming: { modifiers: {}, set_mapping: {} }
naming:
  css_prefix: "a-"
  token_prefix: "--a-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

const PROFILE_B = PROFILE_A.replace('"a-"', '"b-"')
  .replace('"--a-"', '"--b-"')
  .replace("name: A", "name: B");

function buildTool(tempDir: string) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { type: string; text: string }[] }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_diff_profile") handler = fn;
    return orig(name, def, fn);
  };
  registerDiffProfileTool(server, [tempDir]);
  if (!handler) throw new Error("cdf_diff_profile handler not captured");
  return handler;
}

describe("cdf_diff_profile", () => {
  let tempDir: string;
  let invoke: ReturnType<typeof buildTool>;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdf-mcp-diff-"));
    writeFileSync(join(tempDir, "a.profile.yaml"), PROFILE_A);
    writeFileSync(join(tempDir, "b.profile.yaml"), PROFILE_B);
    invoke = buildTool(tempDir);
  });

  it("returns changes + impact flags", async () => {
    const result = await invoke({ before: "a", after: "b" });
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.changes).toBeDefined();
    expect(Array.isArray(parsed.changes)).toBe(true);
    expect(parsed.changes.length).toBeGreaterThan(0);
    expect(parsed.impact).toBeDefined();
    expect(parsed.resolution).toBe("merged");
  });

  it("errors when before and after resolve to the same path", async () => {
    const result = await invoke({ before: "a", after: "a" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/same/i);
  });

  it("respects raw:true flag", async () => {
    const result = await invoke({ before: "a", after: "b", raw: true });
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.resolution).toBe("raw");
  });
});
