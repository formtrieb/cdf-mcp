import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { registerRenderFindingsTool } from "../src/tools/render-findings.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

interface BuildResult {
  invoke: Handler;
  workDir: string;
  cleanup: () => void;
}

function buildTool(): BuildResult {
  const workDir = mkdtempSync(join(tmpdir(), "cdf-mcp-render-findings-"));
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  const orig = server.registerTool.bind(server);
  // @ts-expect-error patch to capture handler
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_render_findings") handler = fn;
    return orig(name, def as never, fn as never);
  };
  registerRenderFindingsTool(server);
  if (!handler) throw new Error("cdf_render_findings handler not captured");
  return {
    invoke: handler,
    workDir,
    cleanup: () => rmSync(workDir, { recursive: true, force: true }),
  };
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

const VALID_FINDINGS = {
  schema_version: "findings-v1",
  ds_name: "test-ds",
  generated_at: "2026-04-26T00:00:00Z",
  findings: [
    {
      id: "F1",
      cluster: "A",
      title: "Sample finding 1",
      observation: "Something observed",
      user_decision: "block",
    },
    {
      id: "F2",
      cluster: "B",
      title: "Sample finding 2",
      observation: "Another observation",
      user_decision: "accept-as-divergence",
    },
  ],
  summary: {
    total_findings: 2,
    by_cluster: { A: 1, B: 1 },
    by_decision: { block: 1, "accept-as-divergence": 1 },
    ship_blockers: ["F1"],
  },
};

function writeFindings(workDir: string, content: unknown, name = "findings.yaml"): string {
  const path = join(workDir, name);
  writeFileSync(path, stringifyYaml(content));
  return path;
}

describe("cdf_render_findings", () => {
  it("renders valid findings.yaml to markdown next to the input", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, VALID_FINDINGS);
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      expect(typeof parsed.output_path).toBe("string");
      expect(existsSync(parsed.output_path as string)).toBe(true);
      expect(parsed.finding_count).toBe(2);
      expect(parsed.block_count).toBe(1);
    } finally {
      ctx.cleanup();
    }
  });

  it("default output path is alongside the input with .md extension", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, VALID_FINDINGS, "x.findings.yaml");
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(join(ctx.workDir, "x.findings.md"));
    } finally {
      ctx.cleanup();
    }
  });

  it("respects custom output_md_path", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, VALID_FINDINGS);
      const customPath = join(ctx.workDir, "custom-out.md");
      const result = await ctx.invoke({
        findings_yaml_path: yamlPath,
        output_md_path: customPath,
      });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("hard-fails on schema_version mismatch", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, {
        ...VALID_FINDINGS,
        schema_version: "findings-v0",
      });
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/findings-v1/);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when input file does not exist", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        findings_yaml_path: join(ctx.workDir, "no-such-file.yaml"),
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found|exist/i);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when input is malformed YAML", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = join(ctx.workDir, "bad.yaml");
      writeFileSync(yamlPath, "this: : is: not: valid:::");
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("renders block_count from summary.ship_blockers", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, {
        ...VALID_FINDINGS,
        findings: [
          { ...VALID_FINDINGS.findings[0], id: "B1" },
          { ...VALID_FINDINGS.findings[0], id: "B2" },
          { ...VALID_FINDINGS.findings[1], id: "C1" },
        ],
        summary: {
          total_findings: 3,
          by_cluster: { A: 2, B: 1 },
          by_decision: { block: 2, "accept-as-divergence": 1 },
          ship_blockers: ["B1", "B2"],
        },
      });
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      expect(parsed.finding_count).toBe(3);
      expect(parsed.block_count).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("renders empty findings array cleanly", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, {
        ...VALID_FINDINGS,
        findings: [],
        summary: {
          total_findings: 0,
          by_cluster: {},
          by_decision: {},
          ship_blockers: [],
        },
      });
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      expect(parsed.finding_count).toBe(0);
      expect(parsed.block_count).toBe(0);
      expect(existsSync(parsed.output_path as string)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("emitted markdown contains finding titles", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, VALID_FINDINGS);
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      const md = readFileSync(parsed.output_path as string, "utf8");
      expect(md).toContain("Sample finding 1");
      expect(md).toContain("Sample finding 2");
    } finally {
      ctx.cleanup();
    }
  });

  it("emitted markdown ends with newline (LF discipline)", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, VALID_FINDINGS);
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      const parsed = parseResult(result);
      const md = readFileSync(parsed.output_path as string, "utf8");
      expect(md.endsWith("\n")).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("handles missing summary gracefully (returns isError, not crash)", async () => {
    const ctx = buildTool();
    try {
      const yamlPath = writeFindings(ctx.workDir, {
        schema_version: "findings-v1",
        ds_name: "x",
        findings: [],
      });
      const result = await ctx.invoke({ findings_yaml_path: yamlPath });
      // Either renders fine treating summary as empty, or returns isError;
      // both are acceptable but it must NOT throw an unhandled exception
      expect(typeof result.isError === "undefined" || typeof result.isError === "boolean").toBe(true);
    } finally {
      ctx.cleanup();
    }
  });
});
