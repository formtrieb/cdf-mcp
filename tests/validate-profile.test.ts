/**
 * Smoke tests for the cdf_validate_profile MCP tool (v1.5.0).
 *
 * The tool is a thin adapter around `validateProfile` / `validateProfileFile`
 * from cdf-core. The exhaustive validator behavior is covered in
 * `cdf-core/test/profile-validator.test.ts` — these tests verify the MCP
 * surface: input dispatch, severity filter, error responses.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerValidateProfileTool } from "../src/tools/validate-profile.js";

const MINIMAL_VALID = `
name: Acme
version: "1.0.0"
cdf_version: ">=1.0.0"
dtcg_version: "2025.10"
description: "Acme."

vocabularies:
  hierarchy: { description: x, values: [a, b] }

token_grammar:
  g1: { pattern: x, dtcg_type: color, description: x }

theming:
  modifiers: {}
  set_mapping: {}

naming:
  css_prefix: "ac-"
  token_prefix: "--ac-"
  methodology: BEM
  pattern: "block__element--modifier"
  casing: { components: PascalCase }
  reserved_names: {}
`;

// Drive the registered tool by calling its handler directly. The MCP
// SDK doesn't expose a public way to invoke tools without a transport,
// so we capture the handler at register-time via a tiny shim.
function buildTool() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler:
    | ((args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>)
    | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: typeof handler) => {
    if (name === "cdf_validate_profile") handler = fn;
    return orig(name, def, fn);
  };
  registerValidateProfileTool(server);
  if (!handler) throw new Error("cdf_validate_profile handler not captured");
  return handler;
}

describe("cdf_validate_profile MCP tool", () => {
  let invoke: ReturnType<typeof buildTool>;
  beforeAll(() => {
    invoke = buildTool();
  });

  it("rejects when neither profile_path nor profile_yaml is given", async () => {
    const r = await invoke({ severity: "warning" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Provide either");
  });

  it("rejects when both profile_path and profile_yaml are given", async () => {
    const r = await invoke({
      profile_path: "/tmp/x.yaml",
      profile_yaml: "name: x\n",
      severity: "warning",
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("only one of");
  });

  it("validates inline YAML", async () => {
    const r = await invoke({ profile_yaml: MINIMAL_VALID, severity: "info" });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(r.content[0].text);
    expect(report.valid).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it("validates a file path", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cdf-mcp-validate-profile-"));
    const path = join(tmp, "p.profile.yaml");
    writeFileSync(path, MINIMAL_VALID);
    const r = await invoke({ profile_path: path, severity: "info" });
    expect(r.isError).toBeFalsy();
    const report = JSON.parse(r.content[0].text);
    expect(report.valid).toBe(true);
    expect(report.file).toContain("p.profile.yaml");
  });

  it("returns isError when profile_path doesn't exist", async () => {
    const r = await invoke({
      profile_path: "/nonexistent/profile.yaml",
      severity: "warning",
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("not found");
  });

  it("filters by severity (default warning hides info)", async () => {
    const r = await invoke({ profile_yaml: MINIMAL_VALID, severity: "warning" });
    const report = JSON.parse(r.content[0].text);
    // depth-info issue should be filtered out at warning-level
    expect(report.info).toHaveLength(0);
  });

  it("L8 stays off by default", async () => {
    const r = await invoke({ profile_yaml: MINIMAL_VALID, severity: "info" });
    const report = JSON.parse(r.content[0].text);
    expect(report.info[0].message).toContain("L0-L7");
  });

  it("L8 turns on when resolve_tokens=true", async () => {
    const r = await invoke({
      profile_yaml: MINIMAL_VALID,
      resolve_tokens: true,
      severity: "info",
    });
    const report = JSON.parse(r.content[0].text);
    expect(report.info[0].message).toContain("L0-L8");
  });
});
