import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseProfileFile } from "@formtrieb/cdf-core";
import { resolveProfile } from "../utils.js";

const PROFILE_SECTIONS = [
  "vocabularies",
  "token_grammar",
  "token_layers",
  "standalone_tokens",
  "interaction_patterns",
  "theming",
  "accessibility_defaults",
  "naming",
  "categories",
  "assets",
  "css_defaults",
  "extends",
  "description",
  "version",
] as const;

export function registerGetProfileSectionTool(
  server: McpServer,
  specDirectories: string[],
) {
  server.registerTool(
    "cdf_get_profile_section",
    {
      description:
        "Read and parse a CDF profile, returning the full profile or a single top-level " +
        "section. Does NOT auto-resolve extends: — for merged view, call cdf_resolve_extends.",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name (e.g. 'formtrieb') or file path"),
        section: z
          .enum(PROFILE_SECTIONS)
          .optional()
          .describe("Return only this section. Omit for full profile."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ profile, section }) => {
      const path = resolveProfile(profile, specDirectories);
      const parsed = parseProfileFile(path);
      const result = section
        ? { [section]: (parsed as unknown as Record<string, unknown>)[section] }
        : parsed;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
