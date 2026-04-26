import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  analyzeProfileCoverage,
  parseProfileFile,
  parseProfile,
  type DSProfile,
} from "@formtrieb/cdf-core";
import { resolveProfile, loadAllComponents } from "../utils.js";

export function registerCoverageProfileTool(
  server: McpServer,
  specDirectories: string[],
) {
  server.registerTool(
    "cdf_coverage_profile",
    {
      description:
        "Analyze a profile for orphan vocabulary values, grammar templates, and interaction " +
        "patterns. Single-profile scope: does NOT auto-resolve extends. For merged-view " +
        "coverage, first call cdf_resolve_extends and pass merged_yaml via profile_yaml. " +
        "Two-tier behavior: vocab-orphan always runs; grammar-orphan and pattern-orphan " +
        "require ≥1 component in spec_directories (skipped otherwise, reported in " +
        "checks_skipped).",
      inputSchema: {
        profile: z
          .string()
          .optional()
          .describe("Profile name or file path. Either profile or profile_yaml required."),
        profile_yaml: z
          .string()
          .optional()
          .describe(
            "Inline profile YAML (e.g. from cdf_resolve_extends merged_yaml). " +
              "Either profile or profile_yaml required.",
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ profile, profile_yaml }) => {
      if (!profile && !profile_yaml) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Either profile or profile_yaml must be provided.",
            },
          ],
        };
      }

      let parsed: DSProfile;
      let profilePath: string | undefined;
      if (profile_yaml) {
        parsed = parseProfile(profile_yaml);
      } else {
        profilePath = resolveProfile(profile as string, specDirectories);
        parsed = parseProfileFile(profilePath);
      }

      const compEntries = loadAllComponents(specDirectories);
      const components = compEntries.map((e) => e.component);

      const result = analyzeProfileCoverage({
        profile: parsed,
        profilePath,
        components,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
