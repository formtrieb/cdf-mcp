import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCDFFile } from "@formtrieb/cdf-core";
import { findSpecFiles } from "../utils.js";

const CDF_CATEGORIES = [
  "Primitives",
  "Actions",
  "Inputs",
  "Status",
  "Layout",
] as const;

export function registerListTools(
  server: McpServer,
  specDirectories: string[]
) {
  server.registerTool(
    "cdf_list",
    {
      description:
        "List all CDF component specs in the project with optional summary counts. Use this to discover component names before calling cdf_get or cdf_validate on specific components.",
      inputSchema: {
        category: z
          .enum(CDF_CATEGORIES)
          .optional()
          .describe("Filter by category. Omit to list all categories."),
        include_summary: z
          .boolean()
          .default(true)
          .describe("Include property/state/anatomy/event counts per component"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ category, include_summary }) => {
      const files = findSpecFiles(specDirectories);
      const components = files.map((file) => {
        const comp = parseCDFFile(file);
        const entry: Record<string, unknown> = {
          name: comp.name,
          category: comp.category,
          file,
        };

        if (include_summary) {
          entry.properties = comp.properties ? Object.keys(comp.properties).length : 0;
          entry.states = comp.states ? Object.keys(comp.states).length : 0;
          entry.anatomy_parts = comp.anatomy ? Object.keys(comp.anatomy).length : 0;
          entry.events = comp.events ? Object.keys(comp.events).length : 0;
          entry.inherits = comp.inherits ?? null;
          entry.extends = comp.extends ?? null;
          entry.figma_variants = comp.figma?.total_variants ?? null;
        }

        return entry;
      });

      // Filter by category if provided
      const filtered = category
        ? components.filter((c) => (c.category as string)?.toLowerCase() === category.toLowerCase())
        : components;

      // Category counts
      const categories: Record<string, number> = {};
      for (const c of filtered) {
        const cat = (c.category as string) ?? "Uncategorized";
        categories[cat] = (categories[cat] ?? 0) + 1;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                components: filtered,
                total: filtered.length,
                categories,
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
