import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CDFConfig, CDFComponent, TokenTree } from "@formtrieb/cdf-core";
import { parseCDFFile, analyzeComponentCoverage } from "@formtrieb/cdf-core";
import { resolveComponent, loadAllComponents } from "../utils.js";

const PLACEHOLDER_COLORS = ["#f305b7", "#ff00ff"];

export function registerCheckTokensTools(
  server: McpServer,
  specDirectories: string[],
  _config: CDFConfig | undefined,
  tokenTree: TokenTree | undefined
) {
  server.registerTool(
    "cdf_check_tokens",
    {
      description:
        "Cross-reference CDF token paths against the actual token tree to find missing tokens, unused tokens, and placeholder values. Omit `component` for a full system-wide audit. For coverage patterns across the whole system, use cdf_coverage instead.",
      inputSchema: {
        component: z
          .string()
          .optional()
          .describe(
            "Component name or file path to check. Omit for full system check."
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ component }) => {
      if (!tokenTree) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "No token tree loaded. Set `token_sources` in .cdf.config.yaml to enable token cross-referencing.",
            },
          ],
        };
      }

      // Get all token paths from the tree
      const allTokenPaths = new Set<string>();
      const placeholderTokens: { path: string; value: string }[] = [];

      for (const setName of tokenTree.getTokenSetOrder()) {
        for (const token of tokenTree.flattenSet(setName)) {
          allTokenPaths.add(token.dotPath);
          const val = typeof token.$value === "string" ? token.$value.toLowerCase() : "";
          if (PLACEHOLDER_COLORS.includes(val)) {
            placeholderTokens.push({ path: token.dotPath, value: token.$value as string });
          }
        }
      }

      const allLoaded = loadAllComponents(specDirectories);
      const allComponentObjects = allLoaded.map((c) => c.component);
      const isSystemWide = !component;

      const components: { file: string; component: CDFComponent }[] = isSystemWide
        ? allLoaded
        : [
            {
              file: component,
              component: parseCDFFile(resolveComponent(component, specDirectories)),
            },
          ];

      const results = components.map(({ component: comp }) => {
        const coverage = analyzeComponentCoverage(comp, allComponentObjects);

        const missingInTokens = coverage.expandedPaths.filter(
          (p) => !allTokenPaths.has(p)
        );

        return {
          component: comp.name,
          totalExpandedPaths: coverage.expandedPaths.length,
          unexpandablePaths: coverage.unexpandablePaths,
          missingInTokens,
          found: coverage.expandedPaths.length - missingInTokens.length,
        };
      });

      // For system-wide check, find tokens not referenced by any component
      let unusedTokens: string[] = [];
      if (isSystemWide) {
        const allReferencedPaths = new Set(
          allLoaded
            .map((c) => analyzeComponentCoverage(c.component, allComponentObjects))
            .flatMap((c) => c.expandedPaths)
        );
        // Only check component-specific token paths (color.controls.*, color.system-status.*)
        unusedTokens = [...allTokenPaths]
          .filter((p) => p.startsWith("color.controls.") || p.startsWith("color.system-status."))
          .filter((p) => !allReferencedPaths.has(p));
      }

      const result = isSystemWide
        ? {
            reports: results,
            unusedTokens,
            placeholderTokens,
            summary: {
              components: results.length,
              totalMissing: results.reduce((n, r) => n + r.missingInTokens.length, 0),
              totalUnexpandable: results.reduce((n, r) => n + r.unexpandablePaths.length, 0),
              unusedTokenCount: unusedTokens.length,
              placeholderCount: placeholderTokens.length,
            },
          }
        : {
            ...results[0],
            placeholderTokens,
          };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
