# `cdf_vocab_diverge` — Smoke-test fixture

Minimal DS (1 Profile, 2 component specs) hand-crafted to trigger exactly
**two** vocabulary divergences — one per detector case.

## Expected drifts

| # | Case | Location | Drift |
|---|------|----------|-------|
| 1 | (a) Profile vocab | `MenuItem.spec.yaml` → `properties.variant.values` | `primery` (Levenshtein 1 from declared `primary`) |
| 2 | (b) Interaction-pattern states | `MenuItem.spec.yaml` → `states.over` | `over` (Levenshtein 1 from declared `hover` in `pressable`) |

`Button.spec.yaml` is the "canonical" spec (uses `primary` + `hover`) and should
NOT appear as an outlier — only as the counter-evidence for the canonical value.

## Running from the CLI

Quick end-to-end verification without Claude Desktop. Runs detection →
apply → persist against the fixture, then re-runs detection and asserts
idempotency:

```bash
pnpm --filter @formtrieb/cdf-mcp tsx tests/fixtures/vocab-diverge-smoke/run.ts
```

Expected output ends with `SMOKE OK — idempotent after apply.`

**Reset after running:**

```bash
git restore packages/cdf-mcp/tests/fixtures/vocab-diverge-smoke/
```

## Running from Claude Desktop

1. Add (or update) `formtrieb-cdf` in your Claude Desktop MCP config to point
   `CDF_CONFIG` at this fixture:
   ```json
   {
     "mcpServers": {
       "formtrieb-cdf": {
         "command": "node",
         "args": ["/abs/path/to/FormtriebSystem/packages/cdf-mcp/dist/index.js"],
         "env": {
           "CDF_CONFIG": "/abs/path/to/FormtriebSystem/packages/cdf-mcp/tests/fixtures/vocab-diverge-smoke/.cdf.config.yaml"
         }
       }
     }
   }
   ```
2. Rebuild cdf-mcp: `pnpm --filter @formtrieb/cdf-mcp build`.
3. Restart Claude Desktop.
4. In a chat: "Run `cdf_vocab_diverge` in dry-run mode on the current DS."
5. Verify Claude reports two divergences (one vocab, one states).
6. Follow up: "Apply the recommendations in interactive mode."
7. Confirm each elicitation; verify files changed via `git diff`.
8. `git restore .` to reset for another run.

## What to look for

**After `apply` mode:**
- `MenuItem.spec.yaml` — `values: [brand, primary]` (was `primery`), `states.hover` (was `over`).
- `smoke.profile.yaml` — `vocabularies.hierarchy.description` and
  `interaction_patterns.pressable.description` now each carry an appended
  `Decision YYYY-MM-DD: ...` line.
- Comments in Button.spec.yaml (`# Kept in sync …`) untouched.

**A second `dry-run` invocation after apply:** should return `divergences_found: 0`.
