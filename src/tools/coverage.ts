import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeCoverage } from "@formtrieb/cdf-core";
import type { TokenTree } from "@formtrieb/cdf-core";
import { loadAllComponents } from "../utils.js";

export function registerCoverageTools(
  server: McpServer,
  specDirectories: string[],
  _tokenTree: TokenTree | undefined
) {
  server.registerTool(
    "cdf_coverage",
    {
      description:
        "Analyze token-to-component coverage across the entire design system, grouped by token path, by component, or by pattern family. For per-component missing/placeholder token checks, use cdf_check_tokens instead.",
      inputSchema: {
        group_by: z
          .enum(["token", "component", "pattern"])
          .default("token")
          .describe(
            "'token' = for each token, list components using it. 'component' = for each component, list its tokens. 'pattern' = group token paths by {hierarchy}/{state}/{intent} pattern."
          ),
        filter: z
          .string()
          .optional()
          .describe("Glob-style path filter (e.g. 'color.controls.brand.*')"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ group_by, filter }) => {
      const entries = loadAllComponents(specDirectories);
      const components = entries.map((e) => e.component);
      const report = analyzeCoverage(components);

      // Apply filter if provided
      let paths = report.systemWidePaths;
      if (filter) {
        const regex = new RegExp("^" + filter.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        paths = paths.filter((p) => regex.test(p));
      }

      let result: unknown;

      if (group_by === "component") {
        result = {
          components: report.components.map((c) => ({
            name: c.name,
            expandedPaths: filter ? c.expandedPaths.filter((p) => paths.includes(p)) : c.expandedPaths,
            unexpandablePaths: c.unexpandablePaths,
            totalPaths: c.expandedPaths.length,
          })),
        };
      } else if (group_by === "pattern") {
        // Group by token path pattern (replace known values with placeholders)
        const patterns: Record<string, { components: Set<string>; paths: string[] }> = {};
        for (const comp of report.components) {
          for (const path of comp.expandedPaths) {
            if (filter && !paths.includes(path)) continue;
            const pattern = extractPattern(path);
            if (!patterns[pattern]) {
              patterns[pattern] = { components: new Set(), paths: [] };
            }
            patterns[pattern].components.add(comp.name);
            patterns[pattern].paths.push(path);
          }
        }

        result = {
          patterns: Object.fromEntries(
            Object.entries(patterns).map(([pattern, data]) => [
              pattern,
              {
                components: [...data.components].sort(),
                uniquePaths: [...new Set(data.paths)].length,
              },
            ])
          ),
        };
      } else {
        // group_by === "token"
        const tokenMap: Record<string, string[]> = {};
        for (const comp of report.components) {
          for (const path of comp.expandedPaths) {
            if (filter && !paths.includes(path)) continue;
            if (!tokenMap[path]) tokenMap[path] = [];
            tokenMap[path].push(comp.name);
          }
        }
        result = {
          tokens: tokenMap,
          totalUniquePaths: Object.keys(tokenMap).length,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

/**
 * Extract a pattern from a concrete token path by identifying known value segments.
 */
function extractPattern(path: string): string {
  const knownHierarchies = ["brand", "primary", "secondary", "tertiary", "accent"];
  const knownStates = ["enabled", "hover", "pressed", "focused", "disabled", "error", "success", "inactive", "readonly"];
  const knownIntents = ["info", "neutral", "positive", "warning", "negative"];

  const parts = path.split(".");
  return parts
    .map((p) => {
      if (knownHierarchies.includes(p)) return "{hierarchy}";
      if (knownStates.includes(p)) return "{state}";
      if (knownIntents.includes(p)) return "{intent}";
      return p;
    })
    .join(".");
}
