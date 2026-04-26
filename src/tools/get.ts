import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCDFFile, resolveInheritance, resolveExtension } from "@formtrieb/cdf-core";
import type { CDFConfig, CDFComponent } from "@formtrieb/cdf-core";
import { resolveComponent } from "../utils.js";
import { dirname, resolve } from "node:path";

/**
 * Major top-level sections of a CDF component spec.
 * Derived from the CDFComponent interface in cdf-core/src/types/cdf.ts.
 */
const CDF_SECTIONS = [
  "properties",
  "properties_added",
  "properties_removed",
  "properties_sealed",
  "states",
  "events",
  "derived",
  "theme_axes",
  "anatomy",
  "anatomy_overrides",
  "slots",
  "tokens",
  "tokens_overrides",
  "token_gaps",
  "behavior",
  "accessibility",
  "accessibility_overrides",
  "css_architecture",
  "references",
  "figma",
] as const;

export function registerGetTools(
  server: McpServer,
  specDirectories: string[],
  _config: CDFConfig | undefined
) {
  server.registerTool(
    "cdf_get",
    {
      description:
        "Read and parse a CDF component spec, returning the full spec or a single section. Use `resolved: true` to merge inherits/extends parents. For listing all components, use cdf_list. For validation, use cdf_validate.",
      inputSchema: {
        component: z
          .string()
          .min(1)
          .describe(
            "Component name in PascalCase (e.g. 'TextField') or a file path"
          ),
        section: z
          .enum(CDF_SECTIONS)
          .optional()
          .describe(
            "Return only this top-level section. Omit to return the full spec."
          ),
        resolved: z
          .boolean()
          .default(false)
          .describe(
            "If true and the component uses inherits/extends, return the fully merged spec"
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ component, section, resolved }) => {
      const filePath = resolveComponent(component, specDirectories);
      let spec: CDFComponent = parseCDFFile(filePath);

      if (resolved && (spec.inherits || spec.extends)) {
        spec = resolveSpec(spec, filePath);
      }

      const result = section
        ? { [section]: (spec as unknown as Record<string, unknown>)[section] }
        : spec;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

function resolveSpec(spec: CDFComponent, filePath: string): CDFComponent {
  if (spec.inherits) {
    const parentPath = resolve(dirname(filePath), spec.inherits);
    const parent = parseCDFFile(parentPath);
    return resolveInheritance(spec, parent);
  }
  if (spec.extends) {
    const parentPath = resolve(dirname(filePath), spec.extends);
    const parent = parseCDFFile(parentPath);
    return resolveExtension(spec, parent);
  }
  return spec;
}
