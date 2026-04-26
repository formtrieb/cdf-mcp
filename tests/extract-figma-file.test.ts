import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { registerExtractFigmaFileTool } from "../src/tools/extract-figma-file.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

interface BuildResult {
  invoke: Handler;
  cacheRoot: string;
  cleanup: () => void;
}

const MINIMAL_FIXTURE = {
  name: "fixture-minimal-ds",
  document: {
    children: [
      {
        name: "Controls",
        type: "CANVAS",
        children: [
          {
            id: "1:1",
            type: "COMPONENT_SET",
            name: "Button",
            children: [
              { id: "1:2", type: "COMPONENT", name: "State=enabled" },
              { id: "1:3", type: "COMPONENT", name: "State=hover" },
            ],
            componentPropertyDefinitions: {
              State: { type: "VARIANT", variantOptions: ["enabled", "hover"] },
            },
          },
          {
            id: "2:1",
            type: "COMPONENT_SET",
            name: "TextField",
            children: [{ id: "2:2", type: "COMPONENT", name: "State=enabled" }],
            componentPropertyDefinitions: {
              State: { type: "VARIANT", variantOptions: ["enabled"] },
            },
          },
          {
            id: "3:1",
            type: "COMPONENT_SET",
            name: "Checkbox",
            children: [{ id: "3:2", type: "COMPONENT", name: "State=enabled" }],
            componentPropertyDefinitions: {
              State: { type: "VARIANT", variantOptions: ["enabled"] },
            },
          },
        ],
      },
    ],
  },
};

function buildTool(): BuildResult {
  const cacheRoot = mkdtempSync(join(tmpdir(), "cdf-mcp-extract-"));
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  const orig = server.registerTool.bind(server);
  // @ts-expect-error patch to capture handler
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_extract_figma_file") handler = fn;
    return orig(name, def as never, fn as never);
  };
  registerExtractFigmaFileTool(server, cacheRoot);
  if (!handler) throw new Error("cdf_extract_figma_file handler not captured");
  return {
    invoke: handler,
    cacheRoot,
    cleanup: () => rmSync(cacheRoot, { recursive: true, force: true }),
  };
}

function seedRestCache(cacheRoot: string, fileKey: string, payload: unknown = MINIMAL_FIXTURE): string {
  const figmaDir = join(cacheRoot, "figma");
  mkdirSync(figmaDir, { recursive: true });
  const target = join(figmaDir, `${fileKey}.json`);
  writeFileSync(target, JSON.stringify(payload));
  return target;
}

const MINIMAL_RUNTIME_FIXTURE = {
  fileName: "fixture-runtime-minimal",
  pages: [
    {
      id: "0:1",
      name: "Controls",
      type: "PAGE",
      children: [
        {
          id: "1:1",
          type: "COMPONENT_SET",
          name: "Button",
          description: "Primary control",
          children: [{ id: "1:2", type: "COMPONENT", name: "State=enabled" }],
          componentPropertyDefinitions: {
            State: { type: "VARIANT", variantOptions: ["enabled"] },
          },
        },
        {
          id: "2:1",
          type: "COMPONENT_SET",
          name: "Tag",
          children: [{ id: "2:2", type: "COMPONENT", name: "Tone=info" }],
          componentPropertyDefinitions: {
            Tone: { type: "VARIANT", variantOptions: ["info"] },
          },
        },
      ],
    },
  ],
};

function seedRuntimeCache(
  cacheRoot: string,
  fileKey: string,
  payload: unknown = MINIMAL_RUNTIME_FIXTURE,
): string {
  const figmaDir = join(cacheRoot, "figma");
  mkdirSync(figmaDir, { recursive: true });
  const target = join(figmaDir, `${fileKey}.runtime.json`);
  writeFileSync(target, JSON.stringify(payload));
  return target;
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("cdf_extract_figma_file", () => {
  it("source=rest reads cached library.file.json and emits phase-1 YAML", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({ source: "rest", file_key: "ABC123" });
      const parsed = parseResult(result);
      expect(typeof parsed.output_path).toBe("string");
      expect(existsSync(parsed.output_path as string)).toBe(true);
      expect(typeof parsed.component_set_count).toBe("number");
      expect((parsed.component_set_count as number) >= 1).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("default output path is .cdf-cache/phase-1-output.yaml", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({ source: "rest", file_key: "ABC123" });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(join(ctx.cacheRoot, "phase-1-output.yaml"));
    } finally {
      ctx.cleanup();
    }
  });

  it("emitted YAML parses to schema_version phase-1-output-v1", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({ source: "rest", file_key: "ABC123" });
      const parsed = parseResult(result);
      const yaml = parseYaml(readFileSync(parsed.output_path as string, "utf8"));
      expect(yaml.schema_version).toBe("phase-1-output-v1");
      expect(yaml.figma_file.file_key).toBe("ABC123");
      expect(Array.isArray(yaml.ds_inventory.component_sets.entries)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("custom output_path is honoured", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const customPath = join(ctx.cacheRoot, "custom.yaml");
      const result = await ctx.invoke({
        source: "rest",
        file_key: "ABC123",
        output_path: customPath,
      });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=rest with missing cache returns helpful error", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({ source: "rest", file_key: "MISSING" });
      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toMatch(/cdf_fetch_figma_file/);
      expect(text).toMatch(/MISSING/);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=rest with corrupt cache returns parse error", async () => {
    const ctx = buildTool();
    try {
      const figmaDir = join(ctx.cacheRoot, "figma");
      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(join(figmaDir, "BAD.json"), "not-json{");
      const result = await ctx.invoke({ source: "rest", file_key: "BAD" });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime reads cached runtime tree and emits phase-1 YAML", async () => {
    const ctx = buildTool();
    try {
      seedRuntimeCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({
        source: "runtime",
        file_key: "ABC123",
        root_node_id: "0:1",
      });
      const parsed = parseResult(result);
      expect(typeof parsed.output_path).toBe("string");
      expect(existsSync(parsed.output_path as string)).toBe(true);
      expect(parsed.component_set_count).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime emitted YAML carries tier=T0 in generated_by", async () => {
    const ctx = buildTool();
    try {
      seedRuntimeCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({
        source: "runtime",
        file_key: "ABC123",
      });
      const parsed = parseResult(result);
      const yaml = parseYaml(readFileSync(parsed.output_path as string, "utf8"));
      expect(yaml.generated_by.tier).toBe("T0");
      expect(yaml.generated_by.transformer).toMatch(/figma-runtime-adapter/);
      expect(yaml.figma_file.file_key).toBe("ABC123");
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime with missing cache returns helpful error pointing at figma_execute", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        source: "runtime",
        file_key: "MISSING",
      });
      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toMatch(/runtime\.json/);
      expect(text).toMatch(/figma_execute|figma-console/i);
      expect(text).toMatch(/MISSING/);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime with corrupt cache returns parse error", async () => {
    const ctx = buildTool();
    try {
      const figmaDir = join(ctx.cacheRoot, "figma");
      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(join(figmaDir, "BAD.runtime.json"), "not-json{");
      const result = await ctx.invoke({ source: "runtime", file_key: "BAD" });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime with malformed tree (no pages) surfaces adapter error", async () => {
    const ctx = buildTool();
    try {
      seedRuntimeCache(ctx.cacheRoot, "ABC123", { fileName: "broken" });
      const result = await ctx.invoke({ source: "runtime", file_key: "ABC123" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/pages/i);
    } finally {
      ctx.cleanup();
    }
  });

  it("source=runtime honours custom output_path", async () => {
    const ctx = buildTool();
    try {
      seedRuntimeCache(ctx.cacheRoot, "ABC123");
      const customPath = join(ctx.cacheRoot, "runtime-out.yaml");
      const result = await ctx.invoke({
        source: "runtime",
        file_key: "ABC123",
        output_path: customPath,
      });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("counts component_sets correctly from minimal fixture", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({ source: "rest", file_key: "ABC123" });
      const parsed = parseResult(result);
      expect(parsed.component_set_count).toBe(3);
    } finally {
      ctx.cleanup();
    }
  });

  it("returns ds_inventory_axis_count derived from theming_matrix.collections", async () => {
    const ctx = buildTool();
    try {
      seedRestCache(ctx.cacheRoot, "ABC123");
      const result = await ctx.invoke({ source: "rest", file_key: "ABC123" });
      const parsed = parseResult(result);
      expect(typeof parsed.ds_inventory_axis_count).toBe("number");
    } finally {
      ctx.cleanup();
    }
  });

  it("rejects unknown source values", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        source: "invalid-source",
        file_key: "ABC123",
      });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });
});
