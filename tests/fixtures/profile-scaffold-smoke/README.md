# `cdf_profile_scaffold` — Smoke-test fixture

Hand-crafted `ScaffoldInput` covering all three elicitation milestones:

| Milestone | Trigger in this fixture |
|-----------|-------------------------|
| **vocab-naming** | `Button.variant` ∩ `Alert.variant` have 0% overlap (primary/secondary vs info/success/warning) |
| **grammar-pattern** | `color.*` has 8 tokens with consistent depth 3 → borderline (6–9 window) |
| **base-state** | `surface.*.rest` tokens use `rest`; `Button.state` values use `default` — cross-side mismatch surfaces milestone 3 (v1.2.1 coverage, per backlog O2) |

`auto-resolutions.json` supplies:

- `vocab-naming: split-recommended` — produces ≥2 vocabs from the overloaded `variant`.
- `grammar-pattern: accept-grammar` — promotes the borderline `color.*` group into `token_grammar` (F2 end-to-end).
- `base-state: align-to-default` — records the alignment decision so the smoke exercises milestone 3's resolution path.

## Running from the CLI

```bash
pnpm --filter @formtrieb/cdf-mcp tsx tests/fixtures/profile-scaffold-smoke/run.ts
```

Expected output ends with `SMOKE OK`.

## Reset after running

Delete the generated Profile:

```bash
rm packages/cdf-mcp/tests/fixtures/profile-scaffold-smoke/out.profile.yaml
```

The fixture inputs (input.json, auto-resolutions.json, README.md) are
never modified by the run.

## What the smoke checks

1. The tool runs without error when invoked in `apply` mode with a
   complete `auto_resolutions` map.
2. The written Profile round-trips through `parseProfile()` — basic
   schema validity.
3. `token_grammar.color` is present (F2: accept-grammar promoted the
   borderline group).
4. All three milestones surface on the first pass, and each decision
   is recorded with `source: "user"` (v1.2.1 O2 coverage).
5. A second invocation with the same output path errors (C1
   no-overwrite guard).
