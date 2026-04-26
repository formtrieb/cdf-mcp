import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerFetchFigmaFileTool } from "../src/tools/fetch-figma-file.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

interface BuildResult {
  invoke: Handler;
  cacheRoot: string;
  cleanup: () => void;
}

const SAMPLE_FILE = {
  name: "Sample DS",
  document: { children: [{ id: "0:1", name: "Page 1", type: "CANVAS", children: [] }] },
};

function buildTool(opts: { fetchImpl?: typeof fetch } = {}): BuildResult {
  const cacheRoot = mkdtempSync(join(tmpdir(), "cdf-mcp-fetch-figma-"));
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  const orig = server.registerTool.bind(server);
  // @ts-expect-error patch to capture handler
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_fetch_figma_file") handler = fn;
    return orig(name, def as never, fn as never);
  };
  registerFetchFigmaFileTool(server, cacheRoot, opts.fetchImpl);
  if (!handler) throw new Error("cdf_fetch_figma_file handler not captured");
  return {
    invoke: handler,
    cacheRoot,
    cleanup: () => rmSync(cacheRoot, { recursive: true, force: true }),
  };
}

function fakeFetch(payload: unknown, status = 200): typeof fetch {
  const fn = vi.fn(async (_url: unknown, _init?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => JSON.stringify(payload),
  }));
  return fn as unknown as typeof fetch;
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("cdf_fetch_figma_file", () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = { ...process.env };
    delete process.env.FIGMA_PAT;
  });

  afterEach(() => {
    process.env = env;
  });

  it("fetches via REST and caches under .cdf-cache/figma/<key>.json", async () => {
    const ctx = buildTool({ fetchImpl: fakeFetch(SAMPLE_FILE) });
    try {
      const result = await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(false);
      expect(typeof parsed.cached_path).toBe("string");
      expect(existsSync(parsed.cached_path as string)).toBe(true);
      expect(parsed.size_bytes).toBeGreaterThan(0);
      const cached = JSON.parse(readFileSync(parsed.cached_path as string, "utf8"));
      expect(cached).toEqual(SAMPLE_FILE);
    } finally {
      ctx.cleanup();
    }
  });

  it("returns cache_hit=true on second call without refetching", async () => {
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const result = await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(true);
      expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    } finally {
      ctx.cleanup();
    }
  });

  it("force_refresh:true bypasses cache and refetches", async () => {
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const result = await ctx.invoke({
        file_key: "ABC123",
        pat: "test-pat",
        force_refresh: true,
      });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(false);
      expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2);
    } finally {
      ctx.cleanup();
    }
  });

  it("uses pat arg over env (arg-overrides-env)", async () => {
    process.env.FIGMA_PAT = "env-pat";
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      await ctx.invoke({ file_key: "ABC123", pat: "arg-pat" });
      const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const init = calls[0][1] as { headers: Record<string, string> };
      expect(init.headers["X-Figma-Token"]).toBe("arg-pat");
    } finally {
      ctx.cleanup();
    }
  });

  it("falls back to FIGMA_PAT env when no arg given", async () => {
    process.env.FIGMA_PAT = "env-pat";
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      await ctx.invoke({ file_key: "ABC123" });
      const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const init = calls[0][1] as { headers: Record<string, string> };
      expect(init.headers["X-Figma-Token"]).toBe("env-pat");
    } finally {
      ctx.cleanup();
    }
  });

  it("errors with actionable hint when no PAT available", async () => {
    const ctx = buildTool({ fetchImpl: fakeFetch(SAMPLE_FILE) });
    try {
      const result = await ctx.invoke({ file_key: "ABC123" });
      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toMatch(/FIGMA_PAT/);
      expect(text).toMatch(/pat/);
    } finally {
      ctx.cleanup();
    }
  });

  it("propagates Figma REST error with status + hint", async () => {
    const ctx = buildTool({
      fetchImpl: fakeFetch({ err: "invalid_token" }, 403),
    });
    try {
      const result = await ctx.invoke({ file_key: "ABC123", pat: "bad-pat" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/403/);
    } finally {
      ctx.cleanup();
    }
  });

  it("rejects malformed JSON response from Figma", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "not-json{",
    })) as unknown as typeof fetch;
    const ctx = buildTool({ fetchImpl });
    try {
      const result = await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("calls Figma REST URL with file_key", async () => {
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      await ctx.invoke({ file_key: "FILEKEY42", pat: "test-pat" });
      const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls[0][0]).toMatch(/api\.figma\.com\/v1\/files\/FILEKEY42/);
    } finally {
      ctx.cleanup();
    }
  });

  it("creates the figma cache dir if missing", async () => {
    const ctx = buildTool({ fetchImpl: fakeFetch(SAMPLE_FILE) });
    try {
      const result = await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const parsed = parseResult(result);
      const stat = statSync(parsed.cached_path as string);
      expect(stat.isFile()).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("recovers when cached file is corrupt by refetching", async () => {
    const fetchImpl = fakeFetch(SAMPLE_FILE);
    const ctx = buildTool({ fetchImpl });
    try {
      // Pre-write a corrupt cache file
      const figmaDir = join(ctx.cacheRoot, "figma");
      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(join(figmaDir, "ABC123.json"), "not-json{");
      // First call should NOT treat this as a hit — corrupt JSON forces refetch
      const result = await ctx.invoke({ file_key: "ABC123", pat: "test-pat" });
      const parsed = parseResult(result);
      expect(parsed.cache_hit).toBe(false);
      const cached = JSON.parse(readFileSync(parsed.cached_path as string, "utf8"));
      expect(cached).toEqual(SAMPLE_FILE);
    } finally {
      ctx.cleanup();
    }
  });
});
