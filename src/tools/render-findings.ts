import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { renderFindingsMd } from "@formtrieb/cdf-core";
import type { FindingsInput } from "@formtrieb/cdf-core";

interface RenderResult {
  output_path: string;
  finding_count: number;
  block_count: number;
}

function defaultMdPath(yamlPath: string): string {
  const dir = dirname(yamlPath);
  const base = basename(yamlPath).replace(/\.ya?ml$/i, "") + ".md";
  return join(dir, base);
}

export function registerRenderFindingsTool(server: McpServer) {
  server.registerTool(
    "cdf_render_findings",
    {
      description:
        "Render a `findings.yaml` (schema findings-v1) to a human-readable Markdown file. " +
        "Hard-fails on schema-version mismatch. Default output path is alongside the input " +
        "with .md extension.",
      inputSchema: {
        findings_yaml_path: z
          .string()
          .min(1)
          .describe("Path to the findings YAML file (must be schema findings-v1)."),
        output_md_path: z
          .string()
          .optional()
          .describe("Override default output path (default: alongside .yaml with .md ext)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({
      findings_yaml_path,
      output_md_path,
    }: {
      findings_yaml_path: string;
      output_md_path?: string;
    }) => {
      if (!existsSync(findings_yaml_path)) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `findings_yaml_path does not exist: ${findings_yaml_path}`,
            },
          ],
        };
      }

      let parsed: unknown;
      try {
        parsed = parseYaml(readFileSync(findings_yaml_path, "utf8"));
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to parse findings YAML: ${(err as Error).message}`,
            },
          ],
        };
      }

      let md: string;
      try {
        md = renderFindingsMd(parsed as FindingsInput);
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `render-findings: ${(err as Error).message}`,
            },
          ],
        };
      }

      // Ensure trailing LF for diff stability
      if (!md.endsWith("\n")) md += "\n";

      const outPath = output_md_path ?? defaultMdPath(findings_yaml_path);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, md);

      const input = parsed as Partial<FindingsInput>;
      const findingCount = Array.isArray(input.findings) ? input.findings.length : 0;
      const blockCount = Array.isArray(input.summary?.ship_blockers)
        ? input.summary.ship_blockers.length
        : 0;

      const result: RenderResult = {
        output_path: outPath,
        finding_count: findingCount,
        block_count: blockCount,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
