import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface ResolveResult {
  cached_path: string;
  cache_hit: boolean;
  variable_count: number;
  collection_count: number;
}

interface VariableOraclePayload {
  variables: unknown[];
  collections: unknown[];
}

const PASTE_BACK_INSTRUCTIONS = (filePath: string) =>
  `Variable payload not yet cached and no \`variable_payload\` provided.

To resolve Figma Variables (boundVariables resolved values), run this snippet
inside the figma-console MCP via \`figma_execute\` while the file is open in
Figma Desktop:

  // figma_execute payload
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables   = await figma.variables.getLocalVariablesAsync();
  return { collections, variables };

Then call this tool again with the JSON output as \`variable_payload\`:

  cdf_resolve_figma_variables({
    file_key: "<your-file-key>",
    variable_payload: "<paste figma_execute output as a JSON string>"
  })

The result will be cached at:
  ${filePath}

Background: cdf-mcp runs in a separate process from figma-console MCP and
cannot call it directly; the paste-back contract preserves the
Variable-Oracle pattern (1 figma_execute call per file, cached on disk).`;

function readCachedPayload(path: string): VariableOraclePayload | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as VariableOraclePayload;
    if (!Array.isArray(parsed.variables) || !Array.isArray(parsed.collections)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parsePayload(raw: string): VariableOraclePayload | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: `variable_payload is not valid JSON: ${(err as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { error: "variable_payload must be a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.variables)) {
    return { error: "variable_payload missing 'variables' array (figma_execute output shape)" };
  }
  if (!Array.isArray(obj.collections)) {
    return { error: "variable_payload missing 'collections' array (figma_execute output shape)" };
  }
  return obj as unknown as VariableOraclePayload;
}

export function registerResolveFigmaVariablesTool(server: McpServer, cacheRoot: string) {
  server.registerTool(
    "cdf_resolve_figma_variables",
    {
      description:
        "Resolve a Figma file's local Variables (collections + variables) and cache them under " +
        ".cdf-cache/figma/<file_key>.variables.json. cdf-mcp cannot call figma-console MCP directly: " +
        "if the cache is empty, the tool returns paste-back instructions for a `figma_execute` " +
        "snippet — paste its JSON output as `variable_payload` to seed the cache. Subsequent calls " +
        "are cache-hits unless force_refresh:true (which still requires a fresh payload).",
      inputSchema: {
        file_key: z.string().min(1).describe("Figma file ID."),
        variable_payload: z
          .string()
          .optional()
          .describe(
            "JSON string with `{collections, variables}` from a figma_execute Variable-Oracle run.",
          ),
        force_refresh: z
          .boolean()
          .optional()
          .describe(
            "If true, ignore cache. Still requires `variable_payload` since cdf-mcp cannot refetch.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({
      file_key,
      variable_payload,
      force_refresh,
    }: {
      file_key: string;
      variable_payload?: string;
      force_refresh?: boolean;
    }) => {
      const figmaDir = join(cacheRoot, "figma");
      const cachedPath = join(figmaDir, `${file_key}.variables.json`);

      if (!force_refresh) {
        const cached = readCachedPayload(cachedPath);
        if (cached !== null) {
          if (variable_payload) {
            // Treat new payload as a refresh-on-read (caller may want to update without force_refresh)
            const parsed = parsePayload(variable_payload);
            if ("error" in parsed) {
              return {
                isError: true,
                content: [{ type: "text" as const, text: parsed.error }],
              };
            }
            mkdirSync(figmaDir, { recursive: true });
            writeFileSync(cachedPath, variable_payload);
            const result: ResolveResult = {
              cached_path: cachedPath,
              cache_hit: false,
              variable_count: parsed.variables.length,
              collection_count: parsed.collections.length,
            };
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }
          const result: ResolveResult = {
            cached_path: cachedPath,
            cache_hit: true,
            variable_count: cached.variables.length,
            collection_count: cached.collections.length,
          };
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
      }

      if (!variable_payload) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: PASTE_BACK_INSTRUCTIONS(cachedPath) }],
        };
      }

      const parsed = parsePayload(variable_payload);
      if ("error" in parsed) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: parsed.error }],
        };
      }

      mkdirSync(figmaDir, { recursive: true });
      writeFileSync(cachedPath, variable_payload);

      const result: ResolveResult = {
        cached_path: cachedPath,
        cache_hit: false,
        variable_count: parsed.variables.length,
        collection_count: parsed.collections.length,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
