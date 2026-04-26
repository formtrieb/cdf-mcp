import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { diffProfiles } from "@formtrieb/cdf-core";
import { resolveProfile } from "../utils.js";

export function registerDiffProfileTool(
  server: McpServer,
  specDirectories: string[],
) {
  server.registerTool(
    "cdf_diff_profile",
    {
      description:
        "Compare two CDF profiles and report structural differences. Default raw:false " +
        "merges extends: on both sides before diffing (effective-DS view). raw:true diffs " +
        "as-written YAML. Supports two use cases: same-profile-two-versions (e.g. git " +
        "before/after) and different-profiles (e.g. base vs derived). Parent-change " +
        "propagation to child is not directly supported — Skill can compose via two " +
        "cdf_resolve_extends calls.",
      inputSchema: {
        before: z.string().min(1).describe("Profile name or file path (before state)"),
        after: z.string().min(1).describe("Profile name or file path (after state)"),
        section: z
          .string()
          .optional()
          .describe("Restrict diff to a single top-level section (e.g. 'vocabularies')"),
        raw: z
          .boolean()
          .default(false)
          .describe("If true, diff as-written without extends-merge. Default merges both sides."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ before, after, section, raw }) => {
      const beforePath = resolveProfile(before, specDirectories);
      const afterPath = resolveProfile(after, specDirectories);

      if (beforePath === afterPath) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                `'before' and 'after' resolve to the same file path: ${beforePath}. ` +
                `Provide two different profiles or file paths.`,
            },
          ],
        };
      }

      const diff = diffProfiles(beforePath, afterPath, { raw, section });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                before: beforePath,
                after: afterPath,
                resolution: raw ? "raw" : "merged",
                changes: diff.changes,
                impact: diff.impact,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
