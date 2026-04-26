import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCDFFile } from "@formtrieb/cdf-core";
import type { CDFComponent } from "@formtrieb/cdf-core";
import { resolveComponent } from "../utils.js";

export function registerDiffTools(
  server: McpServer,
  specDirectories: string[]
) {
  server.registerTool(
    "cdf_diff",
    {
      description:
        "Compare two CDF specs and report structural differences. Both arguments are required and must resolve to different files. Classifies changes by impact area (properties, tokens, anatomy, figma, accessibility, states).",
      inputSchema: {
        before: z
          .string()
          .min(1)
          .describe("Component name or file path of the 'before' spec"),
        after: z
          .string()
          .min(1)
          .describe("Component name or file path of the 'after' spec"),
        section: z
          .string()
          .optional()
          .describe(
            "Optional — restrict the diff to a single top-level section (e.g. 'properties')"
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ before, after, section }) => {
      const beforePath = resolveComponent(before, specDirectories);
      const afterPath = resolveComponent(after, specDirectories);

      if (beforePath === afterPath) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `'before' and 'after' both resolve to ${beforePath}. Provide two different components or file paths.`,
            },
          ],
        };
      }

      const beforeSpec = parseCDFFile(beforePath);
      const afterSpec = parseCDFFile(afterPath);

      const changes = diffSpecs(beforeSpec, afterSpec, section);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(changes, null, 2) }],
      };
    }
  );
}

interface DiffChange {
  type: "added" | "removed" | "changed";
  path: string;
  before?: unknown;
  after?: unknown;
}

function diffSpecs(
  before: CDFComponent,
  after: CDFComponent,
  section?: string
): { before: string; after: string; changes: DiffChange[]; impact: Record<string, boolean> } {
  const changes: DiffChange[] = [];

  const beforeObj = section
    ? { [section]: (before as unknown as Record<string, unknown>)[section] }
    : (before as unknown as Record<string, unknown>);
  const afterObj = section
    ? { [section]: (after as unknown as Record<string, unknown>)[section] }
    : (after as unknown as Record<string, unknown>);

  diffObjects(beforeObj, afterObj, "", changes);

  const impact = {
    properties_changed: changes.some((c) => c.path.startsWith("properties")),
    tokens_changed: changes.some((c) => c.path.startsWith("tokens")),
    anatomy_changed: changes.some((c) => c.path.startsWith("anatomy")),
    figma_breaking: changes.some(
      (c) => c.path.startsWith("figma") || c.path.startsWith("properties")
    ),
    accessibility_changed: changes.some((c) => c.path.startsWith("accessibility")),
    states_changed: changes.some((c) => c.path.startsWith("states")),
  };

  return {
    before: before.name,
    after: after.name,
    changes,
    impact,
  };
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
  changes: DiffChange[]
): void {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const bVal = before[key];
    const aVal = after[key];

    if (bVal === undefined && aVal !== undefined) {
      changes.push({ type: "added", path, after: aVal });
    } else if (bVal !== undefined && aVal === undefined) {
      changes.push({ type: "removed", path, before: bVal });
    } else if (typeof bVal === "object" && typeof aVal === "object" && bVal !== null && aVal !== null) {
      if (Array.isArray(bVal) && Array.isArray(aVal)) {
        if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
          changes.push({ type: "changed", path, before: bVal, after: aVal });
        }
      } else {
        diffObjects(
          bVal as unknown as Record<string, unknown>,
          aVal as unknown as Record<string, unknown>,
          path,
          changes
        );
      }
    } else if (bVal !== aVal) {
      changes.push({ type: "changed", path, before: bVal, after: aVal });
    }
  }
}
