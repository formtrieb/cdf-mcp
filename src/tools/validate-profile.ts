import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateProfile,
  validateProfileFile,
  filterBySeverity,
} from "@formtrieb/cdf-core";
import type { Severity } from "@formtrieb/cdf-core";

/**
 * cdf_validate_profile — v1.5.0.
 *
 * Profile-level validator (counterpart to cdf_validate_component). Runs
 * L0–L7 by default, optionally L8 (token-reference resolution) when
 * `resolve_tokens: true`.
 *
 * Accepts either:
 *   - profile_path: read + validate a Profile YAML file from disk, or
 *   - profile_yaml: validate an inline YAML string (no extends/L8 file resolution
 *     unless base_dir is supplied so relative paths can be resolved).
 *
 * Both modes return the same shape — a ValidationReport plus the validation
 * depth that ran (L0-L7 or L0-L8).
 */
export function registerValidateProfileTool(server: McpServer) {
  server.registerTool(
    "cdf_validate_profile",
    {
      description:
        "Validate a CDF Profile YAML against the Profile spec. " +
        "L0-L7 run by default (parse, required fields, types, schema-baking, cross-field, " +
        "vocabulary isolation, extends-resolution, set_mapping globs). " +
        "L8 (token-reference resolution against token_sources) is opt-in via `resolve_tokens: true`. " +
        "Pass either `profile_path` (file on disk) or `profile_yaml` (inline string). " +
        "Returns a ValidationReport with errors, warnings, info, and a summary.",
      inputSchema: {
        profile_path: z
          .string()
          .optional()
          .describe(
            "Absolute or workspace-relative path to a Profile YAML file. " +
            "When set, `extends:` and `token_sources` paths resolve relative to this file."
          ),
        profile_yaml: z
          .string()
          .optional()
          .describe(
            "Inline Profile YAML content. Use this when the Profile is composed in-memory " +
            "(e.g. by the cdf-profile-scaffold Skill before writing to disk). Pair with " +
            "`base_dir` if `extends:` or `resolve_tokens` need filesystem context."
          ),
        base_dir: z
          .string()
          .optional()
          .describe(
            "Base directory for resolving `extends:` and `token_sources` paths when " +
            "`profile_yaml` is used (ignored when `profile_path` is supplied — that path's " +
            "directory is used). Defaults to the current working directory."
          ),
        resolve_tokens: z
          .boolean()
          .optional()
          .describe(
            "Enable L8 — resolve `interaction_patterns.<p>.token_mapping` paths against the " +
            "DTCG files declared in `token_sources`. Off by default. When on and token sources " +
            "are unreachable, a warning is emitted and L8 is skipped (does not block the report)."
          ),
        severity: z
          .enum(["error", "warning", "info"])
          .default("warning")
          .describe("Minimum severity level to include in the report."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ profile_path, profile_yaml, base_dir, resolve_tokens, severity }) => {
      // ── Input dispatch ─────────────────────────────────────────────────
      if (!profile_path && !profile_yaml) {
        return errorResp(
          "Provide either `profile_path` (file on disk) or `profile_yaml` (inline string)."
        );
      }
      if (profile_path && profile_yaml) {
        return errorResp(
          "Provide only one of `profile_path` or `profile_yaml`, not both."
        );
      }

      const opts = {
        resolveTokens: resolve_tokens ?? false,
        baseDir: base_dir ? resolve(base_dir) : undefined,
      };

      let report;
      if (profile_path) {
        const abs = resolve(profile_path);
        if (!existsSync(abs)) {
          return errorResp(
            `Profile file not found: ${abs}. Pass an absolute path or one relative to cwd.`
          );
        }
        report = validateProfileFile(abs, opts);
      } else {
        // profile_yaml branch
        report = validateProfile(profile_yaml!, opts, "<inline>");
      }

      // ── Severity filter ────────────────────────────────────────────────
      const minSeverity = severity as Severity;
      const filtered = {
        ...report,
        errors: filterBySeverity(report.errors, minSeverity),
        warnings: filterBySeverity(report.warnings, minSeverity),
        info: filterBySeverity(report.info, minSeverity),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(filtered, null, 2) },
        ],
      };
    }
  );
}

function errorResp(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
