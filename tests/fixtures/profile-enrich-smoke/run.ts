/**
 * Smoke-test for enrich-mode — core-level, no MCP transport.
 *
 * Loads a seed Profile and a ScaffoldInput, reconstructs Phase-2 raw
 * material via `enrichRawMaterial`, runs `runPhase2Interview` with a
 * scripted elicitor, and asserts the synthesis produces the fixed-four-
 * section description for every grammar that received prose answers.
 *
 * Unlike the scaffold smoke this never writes a Profile file — enrich's
 * YAML-patching logic is exercised by the vitest integration suite
 * (`enrich-formtrieb-integration.test.ts`); the smoke here focuses on
 * raw-material reconstruction + interview synthesis.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  enrichRawMaterial,
  parseProfileFile,
  parseScaffoldInput,
} from "@formtrieb/cdf-core";
import {
  runPhase2Interview,
  type Phase2Elicitor,
  type Phase2RoundResponse,
} from "../../../src/tools/profile-scaffold-phase2.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = resolve(HERE, "seed.profile.yaml");
const INPUT_PATH = resolve(HERE, "input.json");

function log(section: string, payload: unknown): void {
  console.log(`\n── ${section} ─────────────────────────────────────`);
  console.log(
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
  );
}

const profile = parseProfileFile(PROFILE_PATH);
const parsed = parseScaffoldInput(readFileSync(INPUT_PATH, "utf-8"));

log("SEED GRAMMARS", Object.keys(profile.token_grammar ?? {}));

const rawMaterial = enrichRawMaterial(profile, parsed.tokens, parsed.components);
for (const [name, g] of Object.entries(rawMaterial.grammars)) {
  log(`USAGE ${name}`, {
    sparsity: g.sparsity,
    perComponent: g.perComponent.map((c) => c.component),
  });
}

// Script: answer for color.controls (5 rounds), skip radius (1 round).
const phase2Script: Array<Phase2RoundResponse | undefined> = [
  {
    prose:
      "Interactive UI controls. Each hierarchy is a complete element × " +
      "state set; components bind one hierarchy and receive all states.",
  },
  {
    prose:
      "A component binds to ONE hierarchy and picks the element subset it " +
      "actually renders.",
  },
  {
    prose:
      "Brand may omit the stroke element; components document the skipped " +
      "slots in their Component spec.",
  },
  {
    prose:
      "Authored from the Formtrieb reference Profile; migrated 2026-04.",
  },
  { skip: true }, // preview
  { skip: true }, // radius — skip on first probe, no preview fires
];

const queue = [...phase2Script];
const scriptedElicitor: Phase2Elicitor = {
  supported: true,
  async ask() {
    return queue.shift();
  },
};

const phase2 = await runPhase2Interview({
  rawMaterial,
  depth: "standard",
  elicitor: scriptedElicitor,
});

log("PHASE-2 RESULT", {
  roundsUsed: phase2.roundsUsed,
  grammarsDescribed: Object.keys(phase2.descriptions),
});

if (!phase2.descriptions["color.controls"]) {
  throw new Error(
    "Enrich smoke: expected `color.controls` description synthesized, got: " +
      JSON.stringify(Object.keys(phase2.descriptions)),
  );
}
if (phase2.descriptions["radius"]) {
  throw new Error(
    "Enrich smoke: `radius` should have been skipped (no prose given) but " +
      "received a synthesized description — skip-path broken",
  );
}
const colorDesc = phase2.descriptions["color.controls"];
for (const heading of ["## System Structure", "## Binding Rules"]) {
  if (!colorDesc.includes(heading)) {
    throw new Error(`Enrich smoke: missing '${heading}' in color.controls description`);
  }
}

console.log("\n✅ ENRICH SMOKE OK");
