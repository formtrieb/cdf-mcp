/**
 * Smoke test for cdf_vocab_diverge — no MCP transport.
 *
 * Exercises the pure core functions (detect + apply + persist) against the
 * fixture files. Verifies the end-to-end flow and the idempotency property.
 *
 * After running, restore the fixture with:
 *   git restore packages/cdf-mcp/tests/fixtures/vocab-diverge-smoke/
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseConfigFile,
  parseCDFFile,
  detectVocabDivergences,
  applyComponentRename,
  persistVocabDecision,
} from "@formtrieb/cdf-core";
import type { ComponentRename } from "@formtrieb/cdf-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, ".cdf.config.yaml");
const PROFILE_PATH = resolve(HERE, "smoke.profile.yaml");
const SPEC_DIR = resolve(HERE, "specs");

function log(section: string, payload: unknown): void {
  console.log(`\n── ${section} ─────────────────────────────────────`);
  console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}

function pathToRename(path: string, from: string, to: string): ComponentRename | undefined {
  const propMatch = path.match(/^properties\.([^.]+)\.values\[/);
  if (propMatch) return { kind: "property-value", property: propMatch[1], from, to };
  if (path.startsWith("states.")) return { kind: "state-key", from, to };
  return undefined;
}

function loadComponents() {
  const specs = [
    resolve(SPEC_DIR, "Button.spec.yaml"),
    resolve(SPEC_DIR, "MenuItem.spec.yaml"),
  ];
  return specs.map((file) => ({ file, component: parseCDFFile(file) }));
}

// ── 1. Detect ─────────────────────────────────────────────────────────────
const config = parseConfigFile(CONFIG_PATH);
if (!config.ds_profile) throw new Error("smoke fixture failed to load Profile");
const profile = config.ds_profile;

let entries = loadComponents();
let divergences = detectVocabDivergences(profile, entries.map((e) => e.component));

log("DRY-RUN findings", {
  count: divergences.length,
  concepts: divergences.map((d) => d.concept),
  recommendations: divergences.map((d) => ({
    concept: d.concept,
    canonical: d.recommendation.canonical,
    rename: d.recommendation.rename,
    evidence: d.recommendation.evidence,
  })),
});

if (divergences.length !== 2) {
  throw new Error(`Expected 2 divergences, got ${divergences.length}`);
}

// ── 2. Apply (each recommendation) ────────────────────────────────────────
for (const d of divergences) {
  const canonical = d.recommendation.canonical;
  const outliers = d.recommendation.rename ?? [];
  const renamed: string[] = [];

  for (const outlier of outliers) {
    const usage = d.values.find((v) => v.value === outlier);
    if (!usage) continue;
    for (const u of usage.used_in) {
      const entry = entries.find((e) => e.component.name === u.component);
      if (!entry) continue;
      const rename = pathToRename(u.path, outlier, canonical);
      if (!rename) continue;
      const before = readFileSync(entry.file, "utf-8");
      const after = applyComponentRename(before, rename);
      if (after !== before) {
        writeFileSync(entry.file, after, "utf-8");
        renamed.push(u.component);
      }
    }
  }

  // Persist decision line
  const beforeProfile = readFileSync(PROFILE_PATH, "utf-8");
  const afterProfile = persistVocabDecision(beforeProfile, {
    concept: d.concept,
    date: new Date().toISOString().slice(0, 10),
    canonical,
    outliers,
    renamedIn: [...new Set(renamed)].sort(),
    evidence: d.recommendation.evidence.profile_declared
      ? `profile-declared (\`${d.recommendation.evidence.profile_declared}\`)`
      : "profile-declared",
  });
  if (afterProfile !== beforeProfile) writeFileSync(PROFILE_PATH, afterProfile, "utf-8");

  log(`APPLIED ${d.concept}`, { canonical, outliers, renamed: [...new Set(renamed)] });
}

// ── 3. Re-detect → idempotency ────────────────────────────────────────────
// Reload everything — files on disk have changed.
const config2 = parseConfigFile(CONFIG_PATH);
entries = loadComponents();
divergences = detectVocabDivergences(
  config2.ds_profile!,
  entries.map((e) => e.component),
);
log("RE-RUN findings", { count: divergences.length });

if (divergences.length !== 0) {
  throw new Error(`Expected 0 divergences after apply, got ${divergences.length}`);
}

console.log("\n✅ SMOKE OK — idempotent after apply.");
console.log("Reset with: git restore packages/cdf-mcp/tests/fixtures/vocab-diverge-smoke/");
