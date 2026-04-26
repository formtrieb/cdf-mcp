import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stringify as yamlStringify } from "yaml";
import { resolveExtends } from "@formtrieb/cdf-core";
import { resolveProfile } from "../utils.js";

export function registerResolveExtendsTool(
  server: McpServer,
  specDirectories: string[],
) {
  server.registerTool(
    "cdf_resolve_extends",
    {
      description:
        "Resolve a profile's extends: chain, returning the fully merged profile as YAML " +
        "plus a provenance map (non-baseline entries only: action='added' or " +
        "action='overridden'). Output merged_yaml is a valid CDF profile and can be piped " +
        "into cdf_validate_profile, cdf_coverage_profile (profile_yaml), or cdf_diff_profile.",
      inputSchema: {
        profile: z.string().min(1).describe("Profile name or file path"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ profile }) => {
      const path = resolveProfile(profile, specDirectories);
      const result = resolveExtends(path);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                profile: result.profile,
                extends_chain: result.extends_chain,
                merged_yaml: yamlStringify(result.merged),
                provenance: result.provenance,
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
