import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CDFComponent, CDFConfig } from "@formtrieb/cdf-core";
import { validateFile, validateAll, filterBySeverity } from "@formtrieb/cdf-core";
import type { ValidationReport, Severity } from "@formtrieb/cdf-core";
import { resolveComponent, loadAllComponents } from "../utils.js";

export function registerValidateComponentTool(
  server: McpServer,
  specDirectories: string[],
  config: CDFConfig | undefined
) {
  server.registerTool(
    "cdf_validate_component",
    {
      description:
        "Validate one or all CDF component specs against format rules. Returns errors, warnings, and info messages. " +
        "Omit `component` to validate the entire design system. " +
        "For Profile-level validation use `cdf_validate_profile` instead — this tool only checks component specs.",
      inputSchema: {
        component: z
          .string()
          .optional()
          .describe(
            "Component name (PascalCase) or file path. Omit to validate every spec in the system."
          ),
        severity: z
          .enum(["error", "warning", "info"])
          .default("warning")
          .describe("Minimum severity level to report"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ component, severity }) => {
      let reports: ValidationReport[];
      const isSystemWide = !component;

      if (isSystemWide) {
        reports = validateAll(specDirectories, config);
      } else {
        // Build a component map so SEM-011/012 can inspect nested specs.
        const components = new Map<string, CDFComponent>(
          loadAllComponents(specDirectories).map((c) => [c.component.name.toLowerCase(), c.component])
        );
        const filePath = resolveComponent(component, specDirectories);
        reports = [
          validateFile(filePath, config, { profile: config?.ds_profile, components }),
        ];
      }

      // Filter by severity
      const minSeverity = severity as Severity;
      const filtered = reports.map((r) => ({
        ...r,
        errors: filterBySeverity(r.errors, minSeverity),
        warnings: filterBySeverity(r.warnings, minSeverity),
        info: filterBySeverity(r.info, minSeverity),
      }));

      const result = isSystemWide
        ? {
            reports: filtered,
            summary: {
              total: filtered.length,
              valid: filtered.filter((r) => r.valid).length,
              invalid: filtered.filter((r) => !r.valid).length,
              errors: filtered.reduce((n, r) => n + r.errors.length, 0),
              warnings: filtered.reduce((n, r) => n + r.warnings.length, 0),
              info: filtered.reduce((n, r) => n + r.info.length, 0),
            },
          }
        : filtered[0];

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
