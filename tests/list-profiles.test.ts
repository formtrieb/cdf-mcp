import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerListProfilesTool } from "../src/tools/list-profiles.js";

const MINIMAL_PROFILE = `
name: SmokeTest
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: "x"
vocabularies:
  axis1: { description: x, values: [a, b] }
token_grammar:
  g1: { pattern: "x.{axis1}", dtcg_type: color, description: x }
theming:
  modifiers: {}
  set_mapping: {}
naming:
  css_prefix: "st-"
  token_prefix: "--st-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

function buildTool() {
  const tempDir = mkdtempSync(join(tmpdir(), "cdf-mcp-list-profiles-"));
  writeFileSync(join(tempDir, "smoke.profile.yaml"), MINIMAL_PROFILE);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_list_profiles") handler = fn;
    return orig(name, def, fn);
  };
  registerListProfilesTool(server, [tempDir]);
  if (!handler) throw new Error("cdf_list_profiles handler not captured");
  return handler;
}

describe("cdf_list_profiles", () => {
  let invoke: ReturnType<typeof buildTool>;
  beforeAll(() => {
    invoke = buildTool();
  });

  it("returns profile list with summary counts", async () => {
    const result = await invoke({ include_summary: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(1);
    expect(parsed.profiles[0].name).toBe("SmokeTest");
    expect(parsed.profiles[0].vocabularies_count).toBe(1);
    expect(parsed.profiles[0].extends).toBeNull();
  });
});
