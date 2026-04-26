import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerResolveFigmaVariablesTool } from "../src/tools/resolve-figma-variables.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

interface BuildResult {
  invoke: Handler;
  cacheRoot: string;
  cleanup: () => void;
}

const SAMPLE_PAYLOAD = {
  collections: [
    { id: "VC1", name: "Color", modes: [{ modeId: "m1", name: "Light" }] },
    { id: "VC2", name: "Spacing", modes: [{ modeId: "m2", name: "Default" }] },
  ],
  variables: [
    { id: "V1", name: "color/bg/primary", resolvedType: "COLOR" },
    { id: "V2", name: "color/text/primary", resolvedType: "COLOR" },
    { id: "V3", name: "spacing/sm", resolvedType: "FLOAT" },
  ],
};

function buildTool(): BuildResult {
  const cacheRoot = mkdtempSync(join(tmpdir(), "cdf-mcp-resolve-vars-"));
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  const orig = server.registerTool.bind(server);
  // @ts-expect-error patch to capture handler
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_resolve_figma_variables") handler = fn;
    return orig(name, def as never, fn as never);
  };
  registerResolveFigmaVariablesTool(server, cacheRoot);
  if (!handler) throw new Error("cdf_resolve_figma_variables handler not captured");
  return {
    invoke: handler,
    cacheRoot,
    cleanup: () => rmSync(cacheRoot, { recursive: true, force: true }),
  };
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("cdf_resolve_figma_variables", () => {
  it("emits paste-back instructions when no cache and no payload", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({ file_key: "ABC123" });
      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toMatch(/figma_execute/);
      expect(text).toMatch(/variable_payload/);
      expect(text).toMatch(/figma\.variables/);
    } finally {
      ctx.cleanup();
    }
  });

  it("accepts variable_payload and writes to cache", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(false);
      expect(typeof parsed.cached_path).toBe("string");
      expect(existsSync(parsed.cached_path as string)).toBe(true);
      expect(parsed.variable_count).toBe(3);
      expect(parsed.collection_count).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("returns cache_hit on second call without payload", async () => {
    const ctx = buildTool();
    try {
      await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const result = await ctx.invoke({ file_key: "ABC123" });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(true);
      expect(parsed.variable_count).toBe(3);
      expect(parsed.collection_count).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("force_refresh:true requires payload (no cache rebuild without it)", async () => {
    const ctx = buildTool();
    try {
      await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const result = await ctx.invoke({ file_key: "ABC123", force_refresh: true });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/variable_payload/);
    } finally {
      ctx.cleanup();
    }
  });

  it("force_refresh:true + payload writes new cache", async () => {
    const ctx = buildTool();
    try {
      await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const newPayload = { collections: [], variables: [{ id: "X" }] };
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(newPayload),
        force_refresh: true,
      });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(false);
      expect(parsed.variable_count).toBe(1);
      expect(parsed.collection_count).toBe(0);
    } finally {
      ctx.cleanup();
    }
  });

  it("rejects malformed JSON payload", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: "not-json{",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/JSON/);
    } finally {
      ctx.cleanup();
    }
  });

  it("rejects payload missing variables/collections fields", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify({ unrelated: true }),
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/variables|collections/);
    } finally {
      ctx.cleanup();
    }
  });

  it("caches under .cdf-cache/figma/<key>.variables.json", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const parsed = parseResult(result);
      expect(parsed.cached_path).toMatch(/figma\/ABC123\.variables\.json$/);
    } finally {
      ctx.cleanup();
    }
  });

  it("recovers when cached file is corrupt by demanding payload", async () => {
    const ctx = buildTool();
    try {
      const figmaDir = join(ctx.cacheRoot, "figma");
      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(join(figmaDir, "ABC123.variables.json"), "not-json{");
      const result = await ctx.invoke({ file_key: "ABC123" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/variable_payload/);
    } finally {
      ctx.cleanup();
    }
  });

  it("paste-back instructions reference the figma-console MCP tool", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({ file_key: "ABC123" });
      const text = result.content[0].text;
      expect(text).toMatch(/figma-console/);
      expect(text).toMatch(/getLocalVariablesAsync|getLocalVariableCollectionsAsync|figma\.variables\.getLocalVariables/);
    } finally {
      ctx.cleanup();
    }
  });

  it("counts work even when payload contains other top-level keys", async () => {
    const ctx = buildTool();
    try {
      const payload = { ...SAMPLE_PAYLOAD, raw: "extra-blob", warnings: [] };
      const result = await ctx.invoke({
        file_key: "ABC123",
        variable_payload: JSON.stringify(payload),
      });
      const parsed = parseResult(result);
      expect(parsed.variable_count).toBe(3);
      expect(parsed.collection_count).toBe(2);
      const cached = JSON.parse(readFileSync(parsed.cached_path as string, "utf8"));
      expect(cached.raw).toBe("extra-blob");
    } finally {
      ctx.cleanup();
    }
  });
});
