import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  parseFigmaRestFile,
  fromRuntimeTree,
  walkFigmaFile,
  emitPhase1Yaml,
  DEFAULT_GENERATED_BY_RUNTIME,
  type Phase1Output,
} from "@formtrieb/cdf-core";

interface ExtractResult {
  output_path: string;
  component_set_count: number;
  component_count: number;
  ds_inventory_axis_count: number;
}

const SourceEnum = z.enum(["rest", "runtime"]);

export function registerExtractFigmaFileTool(server: McpServer, cacheRoot: string) {
  server.registerTool(
    "cdf_extract_figma_file",
    {
      description:
        "Walk a Figma file and emit a phase-1-output-v1 YAML at .cdf-cache/phase-1-output.yaml. " +
        "source='rest' reads the REST cache (.cdf-cache/figma/<key>.json) produced by " +
        "cdf_fetch_figma_file. source='runtime' reads the figma_execute Plugin-API tree dump " +
        "(.cdf-cache/figma/<key>.runtime.json), enabling the T0 path for evaluators without a PAT.",
      inputSchema: {
        source: SourceEnum.describe(
          "'rest' reads .cdf-cache/figma/<key>.json (REST payload). " +
            "'runtime' reads .cdf-cache/figma/<key>.runtime.json (figma_execute Raw-Tree).",
        ),
        file_key: z.string().min(1).describe("Figma file ID."),
        root_node_id: z
          .string()
          .optional()
          .describe(
            "Optional informational hint identifying the root node the runtime tree was " +
              "captured under. Adapter walks all pages in the cached tree regardless.",
          ),
        output_path: z
          .string()
          .optional()
          .describe("Override default output path (.cdf-cache/phase-1-output.yaml)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({
      source,
      file_key,
      output_path,
    }: {
      source: "rest" | "runtime";
      file_key: string;
      root_node_id?: string;
      output_path?: string;
    }) => {
      const cacheFile =
        source === "runtime" ? `${file_key}.runtime.json` : `${file_key}.json`;
      const cachedPath = join(cacheRoot, "figma", cacheFile);

      if (!existsSync(cachedPath)) {
        const hint =
          source === "runtime"
            ? `No runtime tree cached at ${cachedPath}. Capture the Plugin-API tree via the ` +
              `figma-console MCP (figma_execute walking figma.root.children) and write the JSON ` +
              `to that path. Required shape: {fileName?, pages: [{id,name,type?,children:[…]}]}.`
            : `Cached Figma file not found at ${cachedPath}. Run cdf_fetch_figma_file({file_key:"${file_key}"}) ` +
              `first to populate the cache, or pass force_refresh:true if the cache is stale.`;
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `${hint} (file_key='${file_key}')`,
            },
          ],
        };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(readFileSync(cachedPath, "utf8"));
      } catch (err) {
        const remediation =
          source === "runtime"
            ? `Re-capture the figma_execute output and overwrite that file.`
            : `Re-run cdf_fetch_figma_file with force_refresh:true.`;
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Cached Figma file at ${cachedPath} is not valid JSON: ${(err as Error).message}. ${remediation}`,
            },
          ],
        };
      }

      let phase1: Phase1Output;
      try {
        if (source === "runtime") {
          const file = fromRuntimeTree(payload);
          phase1 = walkFigmaFile(file, {
            fileKey: file_key,
            generatedBy: { ...DEFAULT_GENERATED_BY_RUNTIME },
          });
        } else {
          const file = parseFigmaRestFile(payload);
          phase1 = walkFigmaFile(file, { fileKey: file_key });
        }
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Walker failed: ${(err as Error).message}`,
            },
          ],
        };
      }

      const yaml = emitPhase1Yaml(phase1);
      const finalOutputPath = output_path ?? join(cacheRoot, "phase-1-output.yaml");
      mkdirSync(dirname(finalOutputPath), { recursive: true });
      writeFileSync(finalOutputPath, yaml);

      const standalone = phase1.ds_inventory.standalone_components;
      const standaloneTotal =
        standalone.utility.length +
        standalone.documentation.length +
        standalone.widget.length +
        standalone.asset.length;
      // `tree_unique_count` is what was actually walked; `total` (file.componentSets dict)
      // can include remote-library entries that didn't reach the tree.
      const treeUnique = phase1.ds_inventory.component_sets.tree_unique_count;

      const result: ExtractResult = {
        output_path: finalOutputPath,
        component_set_count: treeUnique,
        component_count: treeUnique + standaloneTotal,
        ds_inventory_axis_count: phase1.theming_matrix.collections.length,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
