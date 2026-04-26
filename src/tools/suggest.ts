import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCDFFile, suggestImprovements } from "@formtrieb/cdf-core";
import type { CDFConfig } from "@formtrieb/cdf-core";
import { resolveComponent } from "../utils.js";

export function registerSuggestTools(
  server: McpServer,
  specDirectories: string[],
  config: CDFConfig | undefined
) {
  server.registerTool(
    "cdf_suggest",
    {
      description:
        "Review a CDF spec and suggest improvements for completeness, accessibility, token usage, Figma representation, and internal consistency. Returns suggestions grouped by priority. For hard validation errors, use cdf_validate instead.",
      inputSchema: {
        component: z
          .string()
          .min(1)
          .describe("Component name or file path"),
        focus: z
          .enum(["completeness", "accessibility", "tokens", "figma", "consistency"])
          .optional()
          .describe("Narrow suggestions to a specific area. Omit for all areas."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ component, focus }) => {
      const filePath = resolveComponent(component, specDirectories);
      const spec = parseCDFFile(filePath);

      const suggestions = suggestImprovements(spec, config, focus);

      // Group by priority
      const high = suggestions.filter((s) => s.priority === "high");
      const medium = suggestions.filter((s) => s.priority === "medium");
      const low = suggestions.filter((s) => s.priority === "low");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                component: spec.name,
                suggestions,
                summary: {
                  total: suggestions.length,
                  high: high.length,
                  medium: medium.length,
                  low: low.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
