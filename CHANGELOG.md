# Changelog — `@formtrieb/cdf-mcp`

All notable changes to the CDF MCP adapter are documented here. The
format loosely follows [Keep a Changelog](https://keepachangelog.com/);
the project is pre-1.0 public, so breaking changes still happen but are
called out explicitly.

## [1.7.1] — 2026-04-26

### Fixed — `npx @formtrieb/cdf-mcp` invocation

v1.7.0 shipped without `bin`/`main` fields and without a shebang on
`dist/index.js`, so any `npx @formtrieb/cdf-mcp` invocation failed with
`could not determine executable to run`. This blocked the
[`cdf` Claude Code plugin](https://github.com/formtrieb/cdf-plugin)'s
`.mcp.json` from launching the server.

- Added `"bin": { "cdf-mcp": "dist/index.js" }` to package.json so npx
  has an executable target.
- Added `"main": "dist/index.js"` for module-resolution completeness.
- Added `banner.js: "#!/usr/bin/env node"` to `tsup.config.ts` so the
  built `dist/index.js` carries the shebang ahead of the ESM bundle.
- Added `chmod +x dist/index.js` to the build script (npm preserves
  exec bits across publish).

No behavioural changes; same 22 tools, same 90 tests, same
`@formtrieb/cdf-core@^1.0.1` dependency. Caret-pinned consumers of
`^1.7.0` (including the `cdf` plugin) will pick up this fix on next
`npm install` / `npx`-cache-miss.

## [1.7.0] — 2026-04-26

### Added — Figma Access Modernization (N1+N5 bundle, Session B)

Five new tools surfacing the Session-A TS-port of the Figma Phase-1 walker
and findings/snapshot renderers. Tool count 17 → 22.

- `cdf_fetch_figma_file` — fetch a Figma file's REST payload and cache it
  under `.cdf-cache/figma/<file_key>.json`. PAT resolution: `pat` arg
  overrides `FIGMA_PAT` env; absent both, returns an actionable hint.
  `force_refresh:true` bypasses cache. Replaces the `curl + jq`
  pre-flight previously required of external adopters.
- `cdf_resolve_figma_variables` — cache + count Figma local Variables
  from a `figma_execute` Variable-Oracle output. Because cdf-mcp runs in
  a separate process from `figma-console` MCP, the contract is
  paste-back: when no cache exists and no `variable_payload` is given,
  the tool returns a `figma_execute` snippet to run, with instructions
  to call again with the JSON output. Subsequent calls are cache-hits.
- `cdf_extract_figma_file` — wraps `walkFigmaFile` + `emitPhase1Yaml`
  from `@formtrieb/cdf-core`. `source:"rest"` reads
  `.cdf-cache/figma/<file_key>.json` (produced by `cdf_fetch_figma_file`).
  `source:"runtime"` is reserved for the figma_execute Raw-Tree adapter
  (N5.1 / Session C) and currently throws `NotImplemented` with a
  pointer to the upcoming work.
- `cdf_render_findings` — renders `findings.yaml` (schema `findings-v1`)
  to markdown via `renderFindingsMd`. Hard-fails on schema mismatch.
- `cdf_render_snapshot` — renders a snapshot DS dir's
  `<prefix>.snapshot.profile.yaml` + `<prefix>.snapshot.findings.yaml`
  via `renderSnapshot`. Hard-fails on schema mismatch and on
  `>15` findings (synthesis cap).

### Configuration

- New cache convention: `<configDir>/.cdf-cache/`. Created lazily by the
  first writing tool. FS-resident, survives MCP restarts, manually
  flushable by `rm`-ing the directory.
- No new env vars in v1.7.0. PAT remains `FIGMA_PAT` (existing).

### Non-breaking

Existing 17 tools unchanged. New tools are additive; bash regression
scripts under `scripts/` remain shipped through Session D's
`regression-baseline` (deletion targeted for v1.8.0).

### Skill alignment (N1.5)

`.claude/skills/cdf-profile-scaffold/` and
`.claude/skills/cdf-profile-snapshot/` phase-docs migrated from
bash-script invocations to MCP-tool calls. Bash scripts retained as a
deprecated-fallback note for the transition window.

### Notes

Plan: `docs/plans/active/2026-04-26-figma-access-modernization.md`.
Tagged `cdf-mcp-v1.7.0` locally; not yet pushed (waits on Akt-3).

---

## [1.6.1] — 2026-04-24

### Added

- `cdf_get_spec_fragment` — read one fragment of the CDF-PROFILE-SPEC from `cdf/specs/profile/`. Pattern-mirror of `cdf_get_profile_section`. Supports `format: "markdown"` (default, raw content) and `format: "sections"` (flat heading map for targeted subsection lookup). Paired with the Task 4.A spec split — fragments are canonical authoring source; the monolith `CDF-PROFILE-SPEC.md` is a generated publication artefact for deep-link stability.

### Non-breaking

Read-only, idempotent; no changes to existing tools. Tool count 16 → 17.

### Configuration

- New `CDF_SPECS_DIR` env var — explicit override for the Profile-Spec fragment directory. Takes precedence over auto-detection.
- **Auto walk-up**: when `CDF_SPECS_DIR` is not set, the server walks up from the config's directory looking for `cdf/specs/profile/index.md`. Covers the common monorepo layout where `.cdf.config.yaml` lives in a DS sub-directory alongside a top-level `cdf/specs/` tree. Falls back to `${configDir}/cdf/specs` when the walk-up finds nothing; the tool then returns a clear "fragment not found" error on invocation. Surfaced during a 2026-04-24 integration smoke run where a DS sub-directory had its own MCP and the flat default missed the fragments at `<repo-root>/cdf/specs/`.

---

## [1.6.0] — 2026-04-20

### Added

- `cdf_list_profiles` — discovery tool for `*.profile.yaml` files, with optional summary counts.
- `cdf_get_profile_section` — read a profile or a single top-level section. No auto-extends-resolution.
- `cdf_resolve_extends` — merge a profile's `extends:` chain; returns merged_yaml + provenance map (action: added/overridden) + extends_chain[]. Load-bearing infrastructure for v1.7.0 Conformance-Overlay.
- `cdf_coverage_profile` — orphan detection for vocab (always), grammar + interaction_pattern (cross-layer, skipped when 0 components). Strict vocab-orphan definition (placeholder expansion does not count as reference). Output includes checks_run + checks_skipped for transparent bootstrap behavior.
- `cdf_diff_profile` — structural diff between two profiles. Default raw:false merges extends on both sides; raw:true diffs as-written.

### Non-breaking

All new tools are read-only + idempotent. Existing tool surfaces unchanged. Tool count 11 → 16.

### Implementation notes

- `cdf-core` gains 4 new modules: `parser/profile-discovery.ts`, `resolver/extends-resolver.ts`, `analyzer/profile-coverage.ts`, `analyzer/profile-diff.ts`.
- cdf-core tests: 245 → 273. cdf-mcp smoke tests: 8 → 18.
- Design doc: [`docs/plans/done/2026-04-20-cdf-mcp-v1.6.0-design.md`](../../docs/plans/done/2026-04-20-cdf-mcp-v1.6.0-design.md).

---

## [1.5.0] — 2026-04-20

### Removed — `cdf_emit_profile` (BREAKING)

The pure emit-tool introduced in v1.4.0 is gone. Profile YAML emission
is now done directly by the Skill via the host's built-in `Write` tool;
existence-guard is the Skill's responsibility (Read-attempt before
Write, explicit User confirmation on overwrite). Same correctness
guarantees, simpler tool surface, closer parallel to component-spec
authoring (write-then-validate). Skill `cdf-profile-scaffold` updated
in lockstep — Phase 7 §7.2 rewritten.

### Renamed — `cdf_validate` → `cdf_validate_component` (BREAKING)

The component-scope validator now has an explicit name that pairs with
the new Profile-scope tool. Functionality unchanged; description
clarified to point users to `cdf_validate_profile` for Profile-level
checks.

### Added — `cdf_validate_profile`

New tool. Profile-level validator backed by `validateProfile` /
`validateProfileFile` in `@formtrieb/cdf-core`. Levels:

| Level | Catches |
|---|---|
| L0 | Parseable YAML |
| L1 | Required top-level fields (extends-aware) |
| L2 | Field types correct |
| L3 | Schema baking — only known top-level keys (typo suggestions) |
| L4 | Cross-field structural (token_layer references, etc.) |
| L5 | Vocabulary Isolation Rule (§5.5) |
| L6 | `extends:` resolution (target exists, parses, no cycles per §15.6) |
| L7 | `set_mapping` glob syntax + targets |
| L8 | Token-reference resolution against `token_sources` (opt-in) |

L0–L7 always run; L8 is opt-in via `resolve_tokens: true`. When L8 is
requested but token sources aren't reachable, a warning is emitted
and L8 is skipped — the report doesn't block.

Inputs: either `profile_path` (file on disk; `extends:` and
`token_sources` resolve relative to it) or `profile_yaml` (inline
string, with optional `base_dir`). Same `severity` filter as
`cdf_validate_component`.

### Tool count

11 → 11 (−1 emit, +1 validate_profile, ±0 rename). New inventory:
`cdf_validate_component`, `cdf_validate_profile`, `cdf_list`, `cdf_get`,
`cdf_resolve`, `cdf_check_tokens`, `cdf_diff`, `cdf_coverage`,
`cdf_suggest`, `cdf_scaffold`, `cdf_vocab_diverge`.

### Tests

- `packages/cdf-core/test/profile-validator.test.ts` — 34 tests
  covering L0–L8 (245/245 cdf-core suite green)
- `packages/cdf-mcp/tests/validate-profile.test.ts` — 8 smoke tests
  on the MCP adapter

### Migration notes

Callers of the old tools must update names and signatures:
- `cdf_emit_profile({ profile_yaml, ds_identifier, ... })` → use
  the host's `Write` tool directly to write `<id>.profile.yaml`,
  followed by `cdf_validate_profile({ profile_path: ... })`.
- `cdf_validate({ component, severity })` → `cdf_validate_component({
  component, severity })`. No behavior change.
- New `cdf_validate_profile({ profile_path | profile_yaml,
  resolve_tokens?, severity })` for Profile validation that previously
  didn't exist (was implicit-only via parseProfile-on-emit).

---

## [1.4.1] — 2026-04-20

### Fixed — `parseProfile` (cdf-core) is now `extends:`-aware

The v1.4.0 Master-Skill teaches LLMs to emit child Profiles that
`extends:` a parent and omit inherited top-level sections per CDF
Profile Spec §15.1 (per-key REPLACE merge semantics). Running the Skill
end-to-end against a child DS surfaced a mismatch: `cdf_emit_profile`
(via `parseProfile` in `@formtrieb/cdf-core`) rejected any Profile missing
one of the six standard required fields (`name`, `version`, `vocabularies`,
`token_grammar`, `theming`, `naming`), even when `extends:` was set.
Result: child Profiles had to emit stub-sections (e.g.
`theming: { inherits_parent: true }`) to pass validation — a key not in
the Profile Spec, creating downstream validator confusion.

**Fix:** `parseProfile` in `packages/cdf-core/src/parser/profile-parser.ts`
now relaxes the required-field check when `extends:` is a non-empty
string. Only `name` and `version` remain mandatory on the child
(identity is never inherited per §15.1). The other four fields become
optional on extends-children — their values flow in from the parent at
merge-time. Deep validation of the merged shape is deferred to a future
resolver pass; the emit step verifies shape, not cross-profile
coherence.

**Scope constraints preserved:**
- Standalone (non-extends) Profiles still require all six fields;
  the loosening does NOT leak.
- `extends: ""` or `extends: null` are treated as standalone
  (empty-string guard).
- `name` + `version` stay required on every Profile, extending or not.
- Vocabulary-reference resolution is now guarded — it only runs when
  both `token_grammar` and `vocabularies` are present on the Profile
  being parsed, so an extends-child that overrides only grammar or
  only vocabularies won't spuriously error on unresolvable refs (the
  resolver will handle that at merge-time).

### Tests

- 5 new cases in `packages/cdf-core/test/profile-parser.test.ts` under
  the `§15 extends-child shape` describe block: minimal extends-child,
  partial-override extends-child, still-required name/version on
  extends-child, standalone-missing-vocab regression, empty-string
  extends treated as standalone.
- Full suite: 211/211 cdf-core tests + 12/12 cdf-mcp tests pass.

### Package version catch-up

`package.json` version bumped `1.3.0` → `1.4.1`. The v1.4.0 work
(trim) was documented in the CHANGELOG but the version field wasn't
bumped at the time — this release rolls both forward in one step.
Previous git tags: `cdf-mcp-v1.3.0` remains the most recent release
tag; this release gets `cdf-mcp-v1.4.1` (skipping a
`cdf-mcp-v1.4.0` tag by design — the content of v1.4.0 + v1.4.1 is
released together).

### Cross-reference

- Skill-side polish that surfaced this:
  `docs/plans/active/2026-04-20-v1.4.0-polish-round-4-plan.md`
- Empirical evidence: internal skill-gaps notes from a 2026-04-19 polish-round smoke run.

## [1.4.0] — 2026-04-19

### BREAKING — `cdf_profile_scaffold` removed, replaced by `cdf_emit_profile`

The v1.3.0 `cdf_profile_scaffold` tool (MCP-side elicitation orchestrator,
Phase-1/2 interview state machine, enrich-mode) is **deleted**. Orchestration
moves into the `.claude/skills/cdf-profile-scaffold/` Master-Skill (Sessions
2-3). The MCP adapter is now a pure emit-function.

**Migration:**
- Remove any calls to `cdf_profile_scaffold` — they will error with "unknown
  tool" on v1.4.0.
- Run the `/scaffold-profile` slash-command (or invoke the
  `cdf-profile-scaffold` Skill) to orchestrate a new profile. The Skill
  handles the full 7-phase workflow and calls `cdf_emit_profile` at the end.
- `cdf_validate`, `cdf_coverage`, `cdf_suggest`, `cdf_vocab_diverge` and all
  other read-only tools are **unchanged**.

### Added — `cdf_emit_profile`

New pure emit-function replacing the write-path of `cdf_profile_scaffold`:

- **Input:** `profile_yaml` (LLM-assembled YAML string) + `ds_identifier` +
  optional `output_path`, `findings_md`, `overwrite`.
- **Validation:** parses YAML and checks required Profile fields (`name`,
  `version`, `vocabularies`, `token_grammar`, `theming`, `naming`). Errors
  clearly on missing fields or syntax issues.
- **Output:** writes `{ds_identifier}.profile.yaml`; optionally writes
  `{ds_identifier}.findings.md` alongside. Returns a summary with field
  counts and `next_steps` hints pointing to `cdf_validate` + `cdf_coverage`.
- **No-overwrite guard (default):** errors if output exists unless
  `overwrite: true` is set.
- **Preserves bytes exactly** — no reformatting; the LLM-authored YAML is
  written as-is.

### Removed

- `packages/cdf-mcp/src/tools/profile-scaffold.ts` (937 lines)
- `packages/cdf-mcp/src/tools/profile-scaffold-phase2.ts` (381 lines)
- All Phase-1/2 elicitation orchestration code
- `auto_resolutions`, `elicitation_depth`, `mode`, `workflow`, `profile_path`,
  `skip_elicitation` parameters (these belonged to the old tool)
- Tests for elicitation behavior (40 test cases covering milestones, cap-hit,
  interactive/apply modes, enrich-mode, structural deltas)

### Tests

- 12 new tests for `cdf_emit_profile` (write, default-path, field counts,
  next-steps hints, no-overwrite guard, overwrite flag, findings_md, invalid
  YAML, missing required fields, byte-preservation)
- cdf-core: 206/206 unchanged

## [1.3.0] — 2026-04-19

### Added — Phase-2 interview

- `cdf_profile_scaffold` now runs a **prose-driven Phase-2 interview**
  after the existing three structural milestones. Per-grammar probe
  rounds capture system-level design intent (cartesian-subset rules,
  binding semantics, edge cases, naming conventions) that structural
  inference cannot derive.
- **Ten distinct probe topics** across the four synthesis buckets:
  structural sparsity, binding semantics, edge cases, axis semantics,
  cardinality, closed-vs-open axis sets, axis ordering,
  composition/inheritance, accessibility constraints, naming conventions.
- **Fixed-four-section synthesis** — `## System Structure`, `## Binding
  Rules`, `## Edge Cases`, `## Notes`. Empty sections omitted. Synthesis
  output is snapshot-locked (R3 mitigation) so future format changes
  surface as test diffs.
- **Preview-and-edit round** per grammar — users see the synthesised
  description before persist and may rewrite it with free-form prose.
- **Structural deltas** (hybrid elicitation schema D3): any probe round
  optionally carries a `rename-axis-value` / `remove-axis` /
  `rename-grammar` correction. In scaffold-mode the correction re-runs
  cdf-core inference and the interview continues on fresh data;
  Phase-1 milestones are **never** re-triggered. In enrich-mode deltas
  are advisory in v1.3.0 — emitted Profile preserves original
  structure.

### Added — `workflow: "enrich"` mode

- New `workflow` parameter on `cdf_profile_scaffold`:
  - `scaffold` (default): unchanged v1.2.x behaviour + Phase-2.
  - `enrich`: skips structural inference entirely, runs Phase-2 alone
    against an existing Profile. Requires new `profile_path` parameter.
- Output defaults to `{ds_identifier}.enriched.profile.yaml` — the
  source Profile is **never overwritten**. Pattern + axes + every other
  structural field are preserved byte-identical; only `description:`
  bodies change.
- `mode` controls write-behaviour only in enrich-mode: `dry-run`
  inspects without writing; `interactive` and `apply` persist. The
  interview always runs when elicitation is available and depth ≠
  `minimal`, so users can preview a synthesis before committing.

### Added — `elicitation_depth` knob

- `elicitation_depth: "minimal" | "standard" | "thorough"` controls
  Phase-2 surface. Per-grammar caps: 0 / 3 / 10 probe rounds + 1
  closing + 1 preview. Default: `standard`.
- `workflow=enrich + elicitation_depth=minimal` emits a no-op warning
  and skips the interview (enrich relies on Phase-2 output).

### Fixed

- **I1 — thorough-mode probe repetition.** Session-1 shipped `thorough`
  with `cap=10` but the `PROBES` list had only 3 entries; rounds 4–10
  repeated the Edge-Cases probe seven times. Authored 7 distinct
  additional probe topics; removed the repeat-fallback. Thorough-mode
  now asks 10 distinct probe-question messages.

### Developer

- **Test surface:** 40 tests (was 30 in v1.2.1).
  - +1 I1 distinctness assertion
  - +6 enrich-mode adapter tests (profile-path guards, Phase-1 skip,
    dry-run preview, apply write, summary fields, minimal-no-op warn)
  - +2 formtrieb-profile integration acceptance (skip-all byte-identity;
    one-grammar-answered structural preservation)
  - +1 R3 synthesis snapshot lock
- Two new smoke fixtures:
  - `tests/fixtures/profile-scaffold-smoke/run.ts` extended to exercise
    Phase-2 after the scaffold pass.
  - `tests/fixtures/profile-enrich-smoke/` — new fixture with seed
    Profile + ScaffoldInput; exercises raw-material reconstruction +
    interview synthesis.
- User guide: `docs/guides/cdf-profile-scaffold-phase2.md`.
- New cdf-core exports used by the adapter: `enrichRawMaterial`,
  `parseProfileFile`, `DSProfile`.

### Unchanged from v1.2.1

- Tool surface remains 11 tools. No other tool behaviour changed.
- `mode: "dry-run" | "interactive" | "apply"` semantics in scaffold-
  mode unchanged.
- Phase-1 milestone elicitation cap remains 3.

---

## [1.2.1] — 2026-04-18

Polish release. Five-item backlog from
`docs/plans/superseded/2026-04-18-cdf-mcp-v1.2.1-backlog.md`:

- **N1** — `ch` unit accepted by token-unit validation.
- **N2** — pattern-aware placeholder hint in grammar-usage annotation.
- **O1** — `elicitation_cap_hit` semantics corrected (was dead-code
  against a constant).
- **O2** — smoke fixture coverage for the base-state milestone (M3).
- **O3** — cosmetic simplification in helper naming.

No behavioural changes to the tool surface. 14 MCP tests, cdf-core
185/185.

---

## [1.2.0] — 2026-04-18

Added `cdf_profile_scaffold` tool — scaffolds a fresh CDF Profile YAML
from a ScaffoldInput JSON. Two-pass orchestration (milestones surfaced
→ elicitation / auto-resolutions / defaults → final emit). Three
milestones: `vocab-naming`, `grammar-pattern`, `base-state`. Prior-art
index cached across invocations. File-existence guard (C1).

**F2 fix:** `grammar-pattern.accept-grammar` resolution is now reactive
— borderline tokens actually promote from `standalone_tokens` into
`token_grammar`.

Tool count: 11.

---

## [1.1.1] — 2026-04-18

Polish release for `cdf_vocab_diverge`:

- `Divergence.severity` now graded from evidence strength (was
  hardcoded `"medium"`).
- `Recommendation.action` narrowed to `"rename" | "skip"`.

---

## [1.1.0] — 2026-04-18

Added `cdf_vocab_diverge` tool — Profile-grounded near-miss detection
for component property values / state keys against Profile vocabularies.
Elicitation-aware rename + persist-to-Profile-description.

Tool count: 10.
