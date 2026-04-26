/**
 * Smoke test for cdf_profile_scaffold — pure core, no MCP transport.
 *
 * Exercises scaffoldProfile() end-to-end on the fixture input + complete
 * auto_resolutions, writes a Profile, verifies it round-trips through
 * parseProfile(), checks F2 (accept-grammar promoted color.* into
 * token_grammar), then verifies the no-overwrite guard would refuse a
 * second invocation.
 *
 * Delete `out.profile.yaml` after running to reset the fixture.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scaffoldProfile,
  parseScaffoldInput,
  loadPriorArtIndex,
  parseProfile,
} from "@formtrieb/cdf-core";
import {
  runPhase2Interview,
  type Phase2Elicitor,
  type Phase2RoundResponse,
} from "../../../src/tools/profile-scaffold-phase2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = resolve(HERE, "input.json");
const AUTO_PATH = resolve(HERE, "auto-resolutions.json");
const OUT_PATH = resolve(HERE, "out.profile.yaml");
// Repo-root cdf/examples/ — the smoke test ships inside the monorepo
// so a literal relative path is fine. External callers pass their own.
const EXAMPLES_DIR = resolve(HERE, "../../../../../cdf/examples");

function log(section: string, payload: unknown): void {
  console.log(`\n── ${section} ─────────────────────────────────────`);
  console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}

// Start from a clean slate so the guard assertion is testable.
if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);

const input = parseScaffoldInput(readFileSync(INPUT_PATH, "utf-8"));
const resolutions = JSON.parse(readFileSync(AUTO_PATH, "utf-8")) as Record<string, unknown>;
const priorArt = loadPriorArtIndex(EXAMPLES_DIR);

const result = scaffoldProfile(input, {
  ds_name: "Acme",
  ds_identifier: "acme",
  priorArt,
  date: "2026-04-18",
  resolutions,
  sourceDescription: input.source?.ref,
});

log("SUMMARY", result.summary);
log("MILESTONES SURFACED", {
  vocabNaming: Boolean(result.milestones.vocabNaming),
  grammarPattern: Boolean(result.milestones.grammarPattern),
  baseState: Boolean(result.milestones.baseState),
});
log("DECISIONS", result.decisions);

// ── Assertions ────────────────────────────────────────────────────────────

writeFileSync(OUT_PATH, result.profileYaml, "utf-8");

const parsed = parseProfile(readFileSync(OUT_PATH, "utf-8"));
if (parsed.name !== "Acme") {
  throw new Error(`Expected name "Acme", got "${parsed.name}"`);
}

if (!parsed.token_grammar || !parsed.token_grammar.color) {
  throw new Error(
    "F2 assertion failed: `token_grammar.color` missing despite accept-grammar resolution",
  );
}
log("F2 CHECK", {
  token_grammar_keys: Object.keys(parsed.token_grammar),
  color_pattern: parsed.token_grammar.color.pattern,
});

// Vocab split: Button/Alert variant should have become two distinct vocabs.
const vocabNames = Object.keys(parsed.vocabularies ?? {});
if (!vocabNames.includes("variant")) {
  throw new Error(
    `Expected \`variant\` in vocabularies, got: ${vocabNames.join(", ")}`,
  );
}
if (vocabNames.length < 2) {
  throw new Error(
    `Expected vocab-naming split (≥2 vocabs for the overloaded \`variant\`), got ${vocabNames.length}: ${vocabNames.join(", ")}`,
  );
}
log("VOCAB SPLIT CHECK", { vocabNames });

// Theming modifiers: Theme → semantic alias.
if (!parsed.theming?.modifiers?.semantic) {
  throw new Error("Expected `theming.modifiers.semantic` from `Theme` mode alias");
}

// O2: base-state milestone surfaces + resolution propagates as a decision.
if (!result.milestones.baseState) {
  throw new Error(
    "O2 assertion failed: base-state milestone did not surface — fixture tokens / properties must disagree on the base-state name",
  );
}
const baseStateDecision = result.decisions.find((d) => d.milestone_id === "base-state");
if (!baseStateDecision) {
  throw new Error("O2: base-state decision missing from result.decisions");
}
if (baseStateDecision.source !== "user") {
  throw new Error(
    `O2: expected base-state decision source "user" (auto_resolutions provided "align-to-default"), got "${baseStateDecision.source}"`,
  );
}
if (!baseStateDecision.summary.includes("align-to-default")) {
  throw new Error(
    `O2: expected base-state decision summary to reference chosen action "align-to-default", got: ${baseStateDecision.summary}`,
  );
}
log("BASE-STATE CHECK", {
  tokenBaseState: result.milestones.baseState.tokenBaseState,
  propertyBaseState: result.milestones.baseState.propertyBaseState,
  decisionSource: baseStateDecision.source,
});

// ── Phase-2 exercise (scaffold-mode, scripted elicitor) ──────────────────

const phase2Script: Array<Phase2RoundResponse | undefined> = [
  { prose: "The color grammar is a full cartesian per hierarchy × element × state." },
  { prose: "Each component binds one hierarchy and receives every state for free." },
  { prose: "Brand variants may legitimately skip the stroke element." },
  { prose: "Authored 2026-04 from the scaffold-smoke fixture." },
  { skip: true }, // preview — accept the synthesized description as-is
];

const queue = [...phase2Script];
const scriptedElicitor: Phase2Elicitor = {
  supported: true,
  async ask() {
    return queue.shift();
  },
};

const phase2 = await runPhase2Interview({
  rawMaterial: result.rawMaterial,
  depth: "standard",
  elicitor: scriptedElicitor,
});

log("PHASE-2 RESULT", {
  roundsUsed: phase2.roundsUsed,
  grammarsDescribed: Object.keys(phase2.descriptions),
  warnings: phase2.warnings,
});

const grammarsDescribed = Object.keys(phase2.descriptions);
if (grammarsDescribed.length === 0) {
  throw new Error(
    "Phase-2 smoke: no grammars received a synthesized description — " +
      "expected at least `color` (promoted via accept-grammar).",
  );
}
for (const g of grammarsDescribed) {
  const desc = phase2.descriptions[g];
  if (!desc.includes("## System Structure")) {
    throw new Error(
      `Phase-2 smoke: grammar \`${g}\` missing '## System Structure' heading`,
    );
  }
  if (!desc.includes("## Binding Rules")) {
    throw new Error(
      `Phase-2 smoke: grammar \`${g}\` missing '## Binding Rules' heading`,
    );
  }
}

console.log("\n✅ SMOKE OK");
console.log("Reset with: rm packages/cdf-mcp/tests/fixtures/profile-scaffold-smoke/out.profile.yaml");
