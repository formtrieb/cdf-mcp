import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import {
  detectVocabDivergences,
  applyComponentRename,
  persistVocabDecision,
} from "@formtrieb/cdf-core";
import type {
  CDFConfig,
  Divergence,
  Evidence,
  ComponentRename,
} from "@formtrieb/cdf-core";
import { loadAllComponents } from "../utils.js";

// M-10: MCP SDK defaults to a 60s request timeout, which fires mid-
// interview when a human reads + decides on a rename. 10 minutes matches
// the attention budget of a considered rename choice.
const INTERACTIVE_ELICITATION_TIMEOUT_MSEC = 10 * 60 * 1000;

/**
 * User- or agent-supplied decision for a single divergence.
 * `skip` returns with no mutation; `rename` rewrites components + (optionally)
 * appends rationale to Profile description.
 */
interface AutoResolution {
  action: "rename" | "skip";
  canonical?: string;
  rename?: string[];
}

interface AppliedChange {
  kind: "component_rename" | "profile_description";
  file: string;
  before_excerpt: string;
  after_excerpt: string;
}

const ELICITATION_CAP = 3;

export function registerVocabDivergeTools(
  server: McpServer,
  specDirectories: string[],
  config: CDFConfig | undefined,
  configPath: string,
) {
  server.registerTool(
    "cdf_vocab_diverge",
    {
      description:
        "Detect vocabulary-value divergences across CDF component specs " +
        "(e.g. `hover` vs `over`, or `primary` vs `primery`). Flags near-miss " +
        "typos against Profile-declared vocabularies and interaction-pattern " +
        "states (Levenshtein ≤2). With `mode: \"interactive\"` the tool elicits " +
        "a resolution per finding (capped at 3), applies the chosen rename to " +
        "affected specs, and appends a dated decision line to the Profile's " +
        "relevant `description:` field. Agent-mode: pass `skip_elicitation: " +
        "true` to return findings only, or `mode: \"apply\"` with " +
        "`auto_resolutions` JSON to apply without prompts.",
      inputSchema: {
        concept_filter: z
          .string()
          .optional()
          .describe(
            "Restrict detection to one concept, e.g. `vocabularies.hierarchy` " +
            "or `interaction_patterns.pressable.states`. Omit to scan all concepts."
          ),
        mode: z
          .enum(["dry-run", "interactive", "apply"])
          .optional()
          .describe(
            "dry-run (default): return findings only. interactive: elicit resolutions, apply, persist. " +
            "apply: apply auto_resolutions (or recommended defaults) without elicitation."
          ),
        auto_resolutions: z
          .string()
          .optional()
          .describe(
            "JSON map of { divergence_id: { action, canonical?, rename? } }. " +
            "Used in apply mode. Missing entries fall back to Recommendation defaults."
          ),
        skip_elicitation: z
          .boolean()
          .optional()
          .describe(
            "Agent-mode flag. Forces elicitation to no-op. Returns findings without mutating. Defaults to false."
          ),
        persist_rationale: z
          .boolean()
          .optional()
          .describe(
            "When a rename is applied, append a dated decision line to the Profile's description. Defaults to true."
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      concept_filter,
      mode: modeArg,
      auto_resolutions,
      skip_elicitation: skipElicitationArg,
      persist_rationale: persistRationaleArg,
    }) => {
      const mode = modeArg ?? "dry-run";
      const skip_elicitation = skipElicitationArg ?? false;
      const persist_rationale = persistRationaleArg ?? true;

      // ─── Preconditions ───────────────────────────────────────────────
      if (!config?.ds_profile || !config.profile_path) {
        return errorResp(
          "cdf_vocab_diverge requires a Profile. Set `profile_path` in .cdf.config.yaml."
        );
      }
      const profile = config.ds_profile;
      const profileAbsPath = resolve(dirname(configPath), config.profile_path);

      // ─── Load + detect ───────────────────────────────────────────────
      const entries = loadAllComponents(specDirectories);
      const components = entries.map((e) => e.component);
      const componentFileByName = new Map(
        entries.map((e) => [e.component.name, e.file] as const),
      );

      const divergences = detectVocabDivergences(profile, components, {
        conceptFilter: concept_filter,
      });

      // ─── Parse auto_resolutions ──────────────────────────────────────
      let auto: Record<string, AutoResolution> = {};
      if (auto_resolutions) {
        try {
          auto = JSON.parse(auto_resolutions) as Record<string, AutoResolution>;
        } catch (err) {
          return errorResp(`Invalid JSON in auto_resolutions: ${(err as Error).message}`);
        }
      }

      // ─── Dry-run / skip-elicitation shortcut ─────────────────────────
      if (mode === "dry-run" || skip_elicitation) {
        return okResp({
          summary: {
            mode,
            divergences_found: divergences.length,
            divergences_resolved: 0,
            divergences_skipped: divergences.length,
            elicitation_used: false,
          },
          divergences,
          applied_changes: [],
        });
      }

      // ─── Resolve each divergence ─────────────────────────────────────
      const applied: AppliedChange[] = [];
      let resolved = 0;
      let skipped = 0;
      let elicitationUsed = false;

      const elicitationSupported = Boolean(server.server.getClientCapabilities()?.elicitation);
      let elicitationsUsed = 0;

      for (const d of divergences) {
        let resolution = auto[d.id];

        // Elicit only in interactive mode, if not already supplied, and under cap.
        if (
          !resolution &&
          mode === "interactive" &&
          elicitationSupported &&
          elicitationsUsed < ELICITATION_CAP
        ) {
          elicitationsUsed++;
          elicitationUsed = true;
          const res = await elicitResolution(server, d);
          if (res) {
            resolution = res;
          } else {
            skipped++;
            continue;
          }
        }

        // Fallback: interactive without capability / over cap, OR apply-mode-without-entry.
        if (!resolution) {
          if (mode === "interactive" && !elicitationSupported) {
            return errorResp(
              "This client does not support elicitation. Use mode: \"apply\" with " +
              "`auto_resolutions` (JSON) or mode: \"dry-run\" to inspect findings."
            );
          }
          resolution = {
            action: d.recommendation.action === "rename" ? "rename" : "skip",
            canonical: d.recommendation.canonical,
            rename: d.recommendation.rename,
          };
        }

        if (resolution.action === "skip") {
          skipped++;
          continue;
        }

        const canonical = resolution.canonical ?? d.recommendation.canonical;
        const outliers = resolution.rename ?? d.recommendation.rename ?? [];
        const renamedComponents = new Set<string>();

        for (const outlier of outliers) {
          const outlierUsage = d.values.find((v) => v.value === outlier);
          if (!outlierUsage) continue;
          for (const u of outlierUsage.used_in) {
            const file = componentFileByName.get(u.component);
            if (!file) continue;
            const renameDesc = componentRenameFromPath(u.path, outlier, canonical);
            if (!renameDesc) continue;

            const before = readFileSync(file, "utf-8");
            const after = applyComponentRename(before, renameDesc);
            if (after === before) continue;

            writeFileSync(file, after, "utf-8");
            renamedComponents.add(u.component);
            applied.push({
              kind: "component_rename",
              file,
              before_excerpt: excerpt(before, outlier),
              after_excerpt: excerpt(after, canonical),
            });
          }
        }

        if (persist_rationale && renamedComponents.size > 0) {
          const beforeProfile = readFileSync(profileAbsPath, "utf-8");
          const afterProfile = persistVocabDecision(beforeProfile, {
            concept: d.concept,
            date: new Date().toISOString().slice(0, 10),
            canonical,
            outliers,
            renamedIn: [...renamedComponents].sort(),
            evidence: formatEvidence(d.recommendation.evidence),
          });
          if (afterProfile !== beforeProfile) {
            writeFileSync(profileAbsPath, afterProfile, "utf-8");
            applied.push({
              kind: "profile_description",
              file: profileAbsPath,
              before_excerpt: "(prior description)",
              after_excerpt: `Decision appended for ${canonical} ← ${outliers.join(", ")}`,
            });
          }
        }

        resolved++;
      }

      return okResp({
        summary: {
          mode,
          divergences_found: divergences.length,
          divergences_resolved: resolved,
          divergences_skipped: skipped,
          elicitation_used: elicitationUsed,
        },
        divergences,
        applied_changes: applied,
      });
    },
  );
}

// ─── Elicitation ────────────────────────────────────────────────────────────

async function elicitResolution(
  server: McpServer,
  d: Divergence,
): Promise<AutoResolution | undefined> {
  // Cross-module invariant: every Divergence produced by `buildDivergence`
  // in cdf-core/analyzer/vocab-divergence.ts currently holds exactly two
  // entries in `d.values` — [canonical, outlier]. The `.find` below is
  // safe under that invariant. If detection ever emits multi-outlier
  // divergences (e.g. 3-way drift `hover` / `over` / `overstate`),
  // generalise this to iterate every non-canonical entry — otherwise the
  // elicitation prompt message will silently drop all but the first.
  const outlier = d.values.find((v) => v.value !== d.recommendation.canonical);
  const outlierValue = outlier?.value ?? (d.recommendation.rename?.[0] ?? "");
  const canonical = d.recommendation.canonical;

  const usageLines = d.values
    .map((v) => {
      const comps = v.used_in.map((u) => u.component).join(", ");
      return `  · \`${v.value}\` — used in ${v.count} component(s) (${comps})`;
    })
    .join("\n");

  const evidenceLines: string[] = [];
  if (d.recommendation.evidence.profile_declared) {
    evidenceLines.push(`  · Profile declares: \`${d.recommendation.evidence.profile_declared}\``);
  }
  if (d.recommendation.evidence.self_usage_majority) {
    const m = d.recommendation.evidence.self_usage_majority;
    evidenceLines.push(`  · Self-usage majority: \`${m.value}\` (${m.ratio})`);
  }

  const message =
    `Vocabulary divergence — ${d.concept}\n\n` +
    `Your specs use ${d.values.length} different values for this concept:\n` +
    usageLines +
    `\n\nEvidence:\n` +
    (evidenceLines.join("\n") || "  · (none)") +
    `\n\nRecommendation: rename \`${outlierValue}\` → \`${canonical}\`.`;

  const result = await server.server.elicitInput({
    message,
    requestedSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          title: "Action",
          enum: ["rename", "skip"],
          default: "rename",
          description: "`rename` applies the canonical value; `skip` leaves this divergence alone.",
        },
        canonical: {
          type: "string",
          title: "Canonical value",
          default: canonical,
          description: "Winning value. Override only if you disagree with the recommendation.",
        },
        rename: {
          type: "string",
          title: "Outliers to rewrite (comma-separated)",
          default: outlierValue,
          description: "Values that will be renamed to canonical across the affected specs.",
        },
      },
      required: ["action"],
    },
  }, { timeout: INTERACTIVE_ELICITATION_TIMEOUT_MSEC });

  if (result.action !== "accept" || !result.content) return undefined;

  const content = result.content as {
    action: string;
    canonical?: string;
    rename?: string;
  };
  return {
    action: content.action === "rename" ? "rename" : "skip",
    canonical: content.canonical,
    rename: content.rename
      ? content.rename.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function componentRenameFromPath(
  path: string,
  from: string,
  to: string,
): ComponentRename | undefined {
  const propMatch = path.match(/^properties\.([^.]+)\.values\[/);
  if (propMatch) return { kind: "property-value", property: propMatch[1], from, to };
  if (path.startsWith("states.")) return { kind: "state-key", from, to };
  return undefined;
}

function formatEvidence(ev: Evidence): string {
  const parts: string[] = [];
  if (ev.profile_declared) parts.push(`profile-declared (\`${ev.profile_declared}\`)`);
  if (ev.self_usage_majority) {
    parts.push(`self ${ev.self_usage_majority.ratio} on \`${ev.self_usage_majority.value}\``);
  }
  if (ev.prior_art) {
    parts.push(`prior-art ${ev.prior_art.ratio} (${ev.prior_art.sources.join(", ")})`);
  }
  return parts.join("; ") || "profile-declared";
}

function excerpt(yamlText: string, needle: string): string {
  const lines = yamlText.split("\n");
  // Skip comment lines — they often describe the drift and contain both the
  // outlier and the canonical (e.g. "# DRIFT: `primery` is a typo of `primary`"),
  // which makes them the first match for both before- and after-excerpts.
  const idx = lines.findIndex(
    (l) => !l.trimStart().startsWith("#") && l.includes(needle),
  );
  if (idx < 0) return `(no match for \`${needle}\`)`;
  const start = Math.max(0, idx - 1);
  const end = Math.min(lines.length, idx + 2);
  return lines.slice(start, end).join("\n");
}

function okResp(body: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}

function errorResp(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
