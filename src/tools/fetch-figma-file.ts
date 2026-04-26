import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const FIGMA_REST_URL = "https://api.figma.com/v1/files";

interface FetchResult {
  cached_path: string;
  cache_hit: boolean;
  fetched_at?: string;
  size_bytes: number;
}

function readCachedFile(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function resolvePat(arg: string | undefined): string | { error: string } {
  if (arg) return arg;
  const env = process.env.FIGMA_PAT;
  if (env) return env;
  return {
    error:
      "FIGMA_PAT not set. Either pass `pat` arg or export the FIGMA_PAT env var. " +
      "MCP-config snippet for designers — add `\"env\": { \"FIGMA_PAT\": \"<token>\" }` " +
      "to the cdf-mcp entry in your client config; engineers can `export FIGMA_PAT=…` " +
      "in their shell.",
  };
}

export function registerFetchFigmaFileTool(
  server: McpServer,
  cacheRoot: string,
  fetchImpl: typeof fetch = fetch,
) {
  server.registerTool(
    "cdf_fetch_figma_file",
    {
      description:
        "Fetch a Figma file's REST payload and cache it under .cdf-cache/figma/<file_key>.json. " +
        "PAT resolution: `pat` arg > FIGMA_PAT env > actionable error. " +
        "Subsequent calls are cache-hits unless force_refresh:true. " +
        "Output path feeds cdf_extract_figma_file({source:'rest'}).",
      inputSchema: {
        file_key: z
          .string()
          .min(1)
          .describe("Figma file ID (the segment after /design/ in a Figma URL)."),
        pat: z
          .string()
          .optional()
          .describe(
            "Optional Figma Personal Access Token. Overrides FIGMA_PAT env if both present.",
          ),
        force_refresh: z
          .boolean()
          .optional()
          .describe("If true, bypass cache and refetch."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({
      file_key,
      pat,
      force_refresh,
    }: {
      file_key: string;
      pat?: string;
      force_refresh?: boolean;
    }) => {
      const figmaDir = join(cacheRoot, "figma");
      const cachedPath = join(figmaDir, `${file_key}.json`);

      if (!force_refresh) {
        const cached = readCachedFile(cachedPath);
        if (cached !== null) {
          const result: FetchResult = {
            cached_path: cachedPath,
            cache_hit: true,
            size_bytes: statSync(cachedPath).size,
          };
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
      }

      const patResult = resolvePat(pat);
      if (typeof patResult !== "string") {
        return {
          isError: true,
          content: [{ type: "text" as const, text: patResult.error }],
        };
      }

      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetchImpl(`${FIGMA_REST_URL}/${file_key}`, {
          headers: { "X-Figma-Token": patResult },
        });
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Figma REST fetch failed: ${(err as Error).message}`,
            },
          ],
        };
      }

      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                `Figma REST returned ${response.status} ${response.statusText}. ` +
                `Common causes: 403 = invalid PAT or no access to file; 404 = file_key wrong. ` +
                `file_key='${file_key}'`,
            },
          ],
        };
      }

      const body = await response.text();
      try {
        JSON.parse(body);
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Figma REST returned non-JSON body: ${(err as Error).message}`,
            },
          ],
        };
      }

      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(cachedPath, body);

      const result: FetchResult = {
        cached_path: cachedPath,
        cache_hit: false,
        fetched_at: new Date().toISOString(),
        size_bytes: statSync(cachedPath).size,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
