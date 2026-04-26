# `cdf_profile_scaffold` — Enrich-Mode Smoke Fixture

Exercises the v1.3.0 enrich-mode pipeline at the core level: loads an
already-authored seed Profile, reconstructs Phase-2 raw material via
`enrichRawMaterial`, runs the interview with a scripted elicitor, and
asserts synthesis produces the fixed-four-section description for the
target grammar.

## Files

| File              | Purpose |
|-------------------|---------|
| `seed.profile.yaml` | Minimal valid Profile with two grammars: `color.controls` (four-axis) and `radius` (one-axis). |
| `input.json`      | ScaffoldInput providing token values + three Components (Button / Tag / Card) binding different subsets of the `color.controls` grammar. |
| `run.ts`          | The smoke runner. Answers five rounds on `color.controls` (prose), skips `radius`, asserts synthesis and skip behaviour. |

## Running

```bash
pnpm --filter @formtrieb/cdf-mcp exec tsx tests/fixtures/profile-enrich-smoke/run.ts
```

Expected output ends with `ENRICH SMOKE OK`.

## What this is not

Unlike `profile-scaffold-smoke`, this fixture does **not** exercise the
YAML-patching layer that writes enriched descriptions back into the
original Profile text. The integration test that asserted structural
preservation against a real Profile was retired in v1.4.0 when the
enrich-mode pipeline was removed from the MCP surface.
