import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findProfileFiles, parseProfileFile } from "@formtrieb/cdf-core";

export function registerListProfilesTool(
  server: McpServer,
  specDirectories: string[],
) {
  server.registerTool(
    "cdf_list_profiles",
    {
      description:
        "List all *.profile.yaml files in spec_directories with optional summary counts. " +
        "Use to discover profile names before calling cdf_get_profile_section, " +
        "cdf_resolve_extends, cdf_coverage_profile, or cdf_diff_profile.",
      inputSchema: {
        include_summary: z
          .boolean()
          .default(true)
          .describe("Include section counts (vocabularies, token_grammars, patterns, axes) per profile"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ include_summary }) => {
      const files = findProfileFiles(specDirectories);
      const profiles = files.map((file) => {
        const p = parseProfileFile(file);
        const entry: Record<string, unknown> = {
          name: p.name,
          version: p.version,
          file,
          extends: p.extends ?? null,
        };
        if (include_summary) {
          entry.vocabularies_count = Object.keys(p.vocabularies ?? {}).length;
          entry.token_grammars_count = Object.keys(p.token_grammar ?? {}).length;
          entry.interaction_patterns_count = Object.keys(p.interaction_patterns ?? {}).length;
          entry.theming_axes_count = Object.keys(p.theming?.modifiers ?? {}).length;
        }
        return entry;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ profiles, total: profiles.length }, null, 2),
          },
        ],
      };
    },
  );
}
