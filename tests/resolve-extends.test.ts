import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerResolveExtendsTool } from "../src/tools/resolve-extends.js";

const PARENT = `
name: Parent
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: x
vocabularies: { hierarchy: { description: x, values: [primary, secondary] } }
token_grammar: { g1: { pattern: "c.{hierarchy}", dtcg_type: color, description: x } }
theming: { modifiers: {}, set_mapping: {} }
naming:
  css_prefix: "pa-"
  token_prefix: "--pa-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

const CHILD = `
name: Child
version: "1.0.0"
extends: "./parent.profile.yaml"
vocabularies:
  hierarchy: { description: x, values: [primary, secondary, tertiary] }
`;

function buildTool(tempDir: string) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_resolve_extends") handler = fn;
    return orig(name, def, fn);
  };
  registerResolveExtendsTool(server, [tempDir]);
  if (!handler) throw new Error("cdf_resolve_extends handler not captured");
  return handler;
}

describe("cdf_resolve_extends", () => {
  let tempDir: string;
  let invoke: ReturnType<typeof buildTool>;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cdf-mcp-resolve-"));
    writeFileSync(join(tempDir, "parent.profile.yaml"), PARENT);
    writeFileSync(join(tempDir, "child.profile.yaml"), CHILD);
    invoke = buildTool(tempDir);
  });

  it("returns merged_yaml + extends_chain + provenance for a child profile", async () => {
    const result = await invoke({ profile: "child" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.extends_chain).toHaveLength(2);
    expect(typeof parsed.merged_yaml).toBe("string");
    expect(parsed.merged_yaml).toContain("tertiary");
    expect(parsed.provenance["vocabularies.hierarchy"]).toBeDefined();
    expect(parsed.provenance["vocabularies.hierarchy"].action).toBe("overridden");
  });
});
