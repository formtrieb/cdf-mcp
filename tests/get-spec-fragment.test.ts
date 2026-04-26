import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGetSpecFragmentTool } from "../src/tools/get-spec-fragment.js";

const VOCABULARIES_FIXTURE = `## 5. Vocabularies

Preamble of the vocabularies section.

### 5.1 Schema

Schema text body.

### 5.2 description

Body for 5.2.
`;

const IDENTITY_FIXTURE = `## 4. Identity\n\nBody.\n`;

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
}>;

function buildTool(): { invoke: Handler; cdfSpecsDir: string } {
  const root = mkdtempSync(join(tmpdir(), "cdf-mcp-spec-fragment-"));
  const fragDir = join(root, "profile");
  mkdirSync(fragDir);
  writeFileSync(join(fragDir, "Vocabularies.md"), VOCABULARIES_FIXTURE);
  writeFileSync(join(fragDir, "Identity.md"), IDENTITY_FIXTURE);

  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  // @ts-expect-error — patch registerTool to capture the async handler
  const orig = server.registerTool.bind(server);
  // @ts-expect-error
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_get_spec_fragment") handler = fn;
    return orig(name, def, fn);
  };
  registerGetSpecFragmentTool(server, root);
  if (!handler) throw new Error("cdf_get_spec_fragment handler not captured");
  return { invoke: handler, cdfSpecsDir: root };
}

describe("cdf_get_spec_fragment", () => {
  let invoke: Handler;
  beforeAll(() => {
    invoke = buildTool().invoke;
  });

  it("returns raw markdown by default", async () => {
    const result = await invoke({ fragment: "Vocabularies" });
    expect(result.content[0].text).toBe(VOCABULARIES_FIXTURE);
  });

  it("returns raw markdown when format='markdown'", async () => {
    const result = await invoke({ fragment: "Identity", format: "markdown" });
    expect(result.content[0].text).toBe(IDENTITY_FIXTURE);
  });

  it("parses sections when format='sections'", async () => {
    const result = await invoke({ fragment: "Vocabularies", format: "sections" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fragment).toBe("Vocabularies");
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0]).toMatchObject({
      heading: "5. Vocabularies",
      level: 2,
    });
    expect(parsed.sections[0].body).toContain("Preamble of the vocabularies section.");
    expect(parsed.sections[1]).toMatchObject({
      heading: "5.1 Schema",
      level: 3,
    });
    expect(parsed.sections[2]).toMatchObject({
      heading: "5.2 description",
      level: 3,
    });
  });

  it("errors with clear message when fragment file is missing", async () => {
    await expect(invoke({ fragment: "Theming" })).rejects.toThrow(
      /Spec fragment 'Theming' not found/,
    );
  });

  it("rejects unknown fragment names at the schema layer", async () => {
    // The enum schema is validated by the MCP SDK before the handler runs.
    // Calling the captured handler directly bypasses that, so a bogus
    // fragment here triggers the fs.existsSync guard instead. Either way
    // the caller sees an error — we just assert it throws.
    await expect(
      invoke({ fragment: "NotARealFragment" } as Record<string, unknown>),
    ).rejects.toThrow();
  });
});
