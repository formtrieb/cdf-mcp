import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGetProfileSectionTool } from "../src/tools/get-profile-section.js";

const MINIMAL_PROFILE = `
name: GetTest
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
  css_prefix: "gt-"
  token_prefix: "--gt-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

function buildTool() {
  const tempDir = mkdtempSync(join(tmpdir(), "cdf-mcp-get-profile-"));
  writeFileSync(join(tempDir, "gettest.profile.yaml"), MINIMAL_PROFILE);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_get_profile_section") handler = fn;
    return orig(name, def, fn);
  };
  registerGetProfileSectionTool(server, [tempDir]);
  if (!handler) throw new Error("cdf_get_profile_section handler not captured");
  return handler;
}

describe("cdf_get_profile_section", () => {
  let invoke: ReturnType<typeof buildTool>;
  beforeAll(() => {
    invoke = buildTool();
  });

  it("returns full profile when section is omitted", async () => {
    const result = await invoke({ profile: "gettest" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("GetTest");
    expect(parsed.vocabularies).toBeDefined();
  });

  it("returns only the selected section", async () => {
    const result = await invoke({ profile: "gettest", section: "vocabularies" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.vocabularies).toBeDefined();
    expect(parsed.name).toBeUndefined();
  });
});
