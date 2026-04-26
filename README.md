# @formtrieb/cdf-mcp

**MCP adapter for [cdf-core](../cdf-core/). Exposes twenty-two tools that let an
LLM client read, validate, author, and refactor CDF component specs and
Profiles, plus fetch + extract Figma files for Profile scaffolding.**

This package is a thin wrapper — all parsing, validation, and analysis
logic lives in `cdf-core`. The adapter's job is to turn those functions
into MCP tools an agent or human can call through a client like Claude
Desktop, the MCP Inspector, or a custom runtime.

## Status

**v1.7.0 — 2026-04-26.** Twenty-two tools. **N1+N5 Figma Access
Modernization** added five new tools that port the bash walker +
renderers to TypeScript and add a `figma_execute` runtime adapter,
unblocking the Snapshot Skill's T0-path (no PAT needed) for evaluators.
See the v1.7.0 section below + [CHANGELOG](./CHANGELOG.md) for the full
list.

Earlier milestones in this line: v1.6.1 added `cdf_get_spec_fragment`;
v1.6.0 added Profile read/diff/coverage (5 tools); v1.5.0 was the
breaking BBQ — drop `cdf_emit_profile`, rename `cdf_validate` → `cdf_validate_component`,
add `cdf_validate_profile` (L0–L8). See CHANGELOG for migration notes.

License: Apache-2.0. Public release queued (Akt 3 of the Phase 8
Public Extract roadmap); until that lands, consumed via `workspace:*`
inside the Formtrieb monorepo and via local install.

## Install & build

Inside the monorepo:

```bash
pnpm install
pnpm --filter @formtrieb/cdf-mcp build
```

Produces a single bundled `dist/index.js` (~162 KB) with all workspace
dependencies inlined. Runnable directly:

```bash
node /abs/path/to/packages/cdf-mcp/dist/index.js
```

The server reads its config path from the `CDF_CONFIG` environment
variable; defaults to `./.cdf.config.yaml` relative to the process
working directory.

## Configure

A minimal `.cdf.config.yaml`:

```yaml
spec_directories:
  - ./specs/components
profile_path: ./ds.profile.yaml
token_sources:
  - ./tokens
```

- `spec_directories` — one or more roots containing `*.spec.yaml` /
  `*.component.yaml` files. Walked recursively.
- `profile_path` — the single Profile YAML that declares vocabularies,
  token grammar, interaction patterns, etc.
- `token_sources` — DTCG token tree root(s). Optional. Set to `[]` or
  omit if no tokens are needed (headless setups).

All paths may be absolute or relative to the config file's directory.

## Tools

| Tool | Purpose |
|------|---------|
| `cdf_validate_component` | Run the validator against one or all component specs. Returns structured issues by severity. (Renamed from `cdf_validate` in v1.5.0.) |
| `cdf_validate_profile` | **(v1.5.0)** Validate a CDF Profile YAML. Runs L0–L7 by default (parse, required fields, types, schema-baking, cross-field, vocabulary isolation, extends-resolution, set_mapping globs); L8 (token-reference resolution against `token_sources`) is opt-in via `resolve_tokens: true`. Accepts either `profile_path` or inline `profile_yaml`. |
| `cdf_list` | List all component specs with optional property/state/anatomy counts, filterable by category. |
| `cdf_get` | Return a single section (e.g. `properties`, `states`, `tokens`) of a component spec, to avoid dumping the whole file. |
| `cdf_resolve` | Resolve a token path via the Profile's grammar — useful for verifying what a binding would look up at build time. |
| `cdf_check_tokens` | Report unresolved / placeholder tokens per component (magenta `#f305b7`, unresolved grammar paths). |
| `cdf_diff` | Compare two components (or two versions of one) — surfaces properties/states/tokens that differ. |
| `cdf_coverage` | Token-coverage report (component-spec scope): how many component-declared bindings are placeholders, gaps, etc. |
| `cdf_suggest` | "Code-review" suggestions for a component spec — completeness, accessibility, tokens, Figma, consistency. Less strict than `cdf_validate_component`. |
| `cdf_scaffold` | Generate a CDF YAML skeleton from Figma analysis data (uses MCP elicitation to confirm component name, category, description). |
| `cdf_vocab_diverge` | **(v1.1.0)** Detect near-miss typos (Levenshtein ≤2) in property values + interaction-pattern states against the Profile; elicit resolutions; apply renames + persist rationale into the Profile. |

### v1.6.0 — Profile-Read + Diff + Coverage (new)

| Tool | Purpose |
|------|---------|
| `cdf_list_profiles` | List all `*.profile.yaml` files with summary counts |
| `cdf_get_profile_section` | Read a profile or a single top-level section |
| `cdf_resolve_extends` | Merge `extends:` chain; returns merged YAML + provenance |
| `cdf_coverage_profile` | Orphan detection (vocab / grammar / pattern); two-tier auto-detection |
| `cdf_diff_profile` | Structural diff; default merges extends on both sides |

### v1.6.1 — Profile-Spec fragment reader (new)

| Tool | Purpose |
|------|---------|
| `cdf_get_spec_fragment` | Read one fragment of CDF-PROFILE-SPEC (e.g. `Vocabularies`, `TokenGrammar`, `InteractionPatterns`). Fragments live under `cdf/specs/profile/`; the monolith `cdf/specs/CDF-PROFILE-SPEC.md` is a generated publication artefact. Use `format: "sections"` for a parsed heading map. |

### v1.7.0 — Figma Access Modernization (N1+N5 bundle)

Five new tools port the bash walker + renderers to TypeScript and add a
runtime adapter for `figma_execute` so Snapshot Skill evaluators no
longer need a Figma PAT (T0 path via `figma-console` MCP).

| Tool | Purpose |
|------|---------|
| `cdf_fetch_figma_file` | REST-fetch a Figma file by `file_key`; PAT via `pat:` arg or `FIGMA_PAT` env (arg overrides). Caches to `.cdf-cache/figma/{file_key}.json`. Use `force_refresh: true` to bypass cache. |
| `cdf_resolve_figma_variables` | Wrap the `figma_execute` Variable-Oracle pattern. Caches resolved Variables to `.cdf-cache/figma/{file_key}.variables.json`. Returns counts + cached path. |
| `cdf_extract_figma_file` | TypeScript port of the bash walker. Two modes: `source: "rest"` (consumes `cdf_fetch_figma_file` cache) and `source: "runtime"` (consumes `figma_execute` raw-tree output, T0-path). Emits `phase-1-output.yaml` consumable by `cdf-profile-scaffold` Skill. |
| `cdf_render_findings` | TypeScript port of `render-findings.sh`. Reads `findings.yaml` → emits markdown (8-section, decision-vocab-rendered, ship-blocker-grouped). Schema-version hard-fail. |
| `cdf_render_snapshot` | TypeScript port of `render-snapshot.sh`. Reads `<prefix>.snapshot.{profile,findings}.yaml` → emits 4-section snapshot markdown (BANNER → FINDINGS → BLIND_SPOTS → UPGRADE). 15-finding cap, schema-version hard-fail. |

These five tools subsume the previous bash pipeline (`scripts/figma-phase1-extract.sh`,
`scripts/extract-to-yaml.sh`, `scripts/render-findings.sh`,
`scripts/render-snapshot.sh`). Bash scripts remain in the Formtrieb
monorepo as a regression bridge until v1.8.0 cleanup PR; external
adopters install the cdf-mcp tool surface and skip bash entirely.

Fragment directory resolution (in order — first match wins):

1. `CDF_SPECS_DIR` env var — explicit override. Use when the fragments
   live somewhere unusual or when scripting against a pinned spec
   revision.
2. Walk up from the config's directory looking for a sibling/ancestor
   `cdf/specs/profile/index.md` marker. Covers the common monorepo
   layout where `.cdf.config.yaml` lives in a DS sub-directory.
3. Package-bundled `dist/spec-fragments/profile/`. The `pnpm build`
   step copies `cdf/specs/profile/*.md` into the package output, so
   an npm-installed user without the monorepo layout still gets
   working fragments out of the box.
4. Last-resort fallback: `${configDir}/cdf/specs` — the tool returns
   a clear "fragment not found" error when invoked, with the path it
   actually checked for diagnosis.

All tools return either `{ content: [{ type: "text", text: "<JSON>" }] }`
on success or `{ isError: true, content: [...] }` on failure. Writes are
limited to `cdf_scaffold` (new Component files) and `cdf_vocab_diverge`
(surgical YAML edits on existing files). Profile YAML is written by
the host's `Write` tool (Skill-orchestrated), not by an MCP tool.

### Non-obvious tools

#### `cdf_vocab_diverge`

Three modes:

- **`dry-run`** (default) — detect + report, no mutation.
- **`interactive`** — elicit a resolution per divergence (capped at 3
  per invocation, per design Principle 1); applies chosen renames;
  appends a dated decision line to the relevant Profile `description:`
  field.
- **`apply`** — apply `auto_resolutions` (JSON map keyed by divergence
  id) or the Recommendation defaults; no prompts.

Agent-mode bypass:

```json
{
  "mode": "dry-run",
  "skip_elicitation": true
}
```

Returns findings without mutating anything — useful for CI checks or
read-only agents. See the [smoke-test fixture](./tests/fixtures/vocab-diverge-smoke/)
for a worked end-to-end example and a Claude-Desktop walkthrough.

#### `cdf_scaffold`

Consumes JSON outputs from Figma-side tooling (`figma_analyze_component_set`,
`extract-token-map.js`, `audit-sub-interactions.js`) and emits a draft
`.spec.yaml`. Always elicits the user to confirm `component_name`,
`category`, and `description` — tool arguments are treated as
suggestions, not final values.

#### `cdf_validate_profile`

Profile-level validator. Runs L0–L7 by default; L8 opt-in:

```
cdf_validate_profile({
  profile_path: "./acme.profile.yaml",   // file on disk
  resolve_tokens: true,                  // optional; enables L8
  severity: "warning",                   // optional; default "warning"
})
```

Or with an inline YAML string (the `cdf-profile-scaffold` Skill uses
this during iterative emit/validate loops before the YAML lands on disk):

```
cdf_validate_profile({
  profile_yaml: "<full Profile YAML>",
  base_dir: "/abs/path/to/profile/dir",  // for extends + token_sources resolution
  resolve_tokens: false,
})
```

L8 (`resolve_tokens: true`) walks
`interaction_patterns.<p>.token_mapping` paths and resolves them
against the DTCG files declared in `token_sources`. When sources
aren't reachable, a warning is emitted and L8 is skipped — the rest
of the report is unaffected.

Returns the same `ValidationReport` shape as `cdf_validate_component`:
`{ file, valid, errors, warnings, info, summary }`.

## Using with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the platform equivalent:

```json
{
  "mcpServers": {
    "formtrieb-cdf": {
      "command": "/absolute/path/to/node",
      "args": ["/abs/path/to/packages/cdf-mcp/dist/index.js"],
      "env": {
        "CDF_CONFIG": "/abs/path/to/your/project/.cdf.config.yaml"
      }
    }
  }
}
```

Two gotchas worth flagging:

1. **Use an absolute path to `node`.** MCP clients launch servers
   without your shell environment, so `node` isn't on PATH. If you
   use nvm, the path includes the version (`~/.nvm/versions/node/vX.Y.Z/bin/node`)
   and will break when you switch versions.
2. **MCP servers launch with `cwd=/` (or similar foreign root).**
   All relative paths in `.cdf.config.yaml` (`./specs`, `./tokens`)
   are resolved relative to the config file's directory — not to the
   server's cwd. Set `CDF_CONFIG` to an absolute path and paths
   inside the config can stay relative.

## Using with other MCP clients

Any MCP stdio client works. The [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
is handy for interactive exploration:

```bash
npx @modelcontextprotocol/inspector node /abs/path/to/packages/cdf-mcp/dist/index.js
```

(Set `CDF_CONFIG` in the environment before the command.)

## MCP elicitation

Several tools use MCP elicitation (`cdf_scaffold`, `cdf_vocab_diverge`
in interactive mode) to ask the user to confirm or override recommended
values. If the client doesn't advertise the `elicitation` capability
in its initialize handshake, these tools fall back gracefully:

- `cdf_scaffold` requires the three identity fields as tool arguments.
- `cdf_vocab_diverge` returns an error pointing to `mode: "apply"` +
  `auto_resolutions` as the non-elicited path.

In practice, a capable agent (like Claude Desktop, even when the
protocol-level cap is absent) wraps the elicitation conversationally
— asking the user directly in chat and then calling the tool with the
answered-for arguments. Same UX shape, different transport.

## Development

```bash
# Fast type-check (no emit, large heap for the MCP SDK's deep types)
pnpm --filter @formtrieb/cdf-mcp build:typecheck

# Bundle to dist/
pnpm --filter @formtrieb/cdf-mcp build

# Run the smoke-test fixture end-to-end (no MCP transport)
pnpm --filter @formtrieb/cdf-mcp exec tsx tests/fixtures/vocab-diverge-smoke/run.ts

# Reset the smoke fixture after a mutation run
git restore packages/cdf-mcp/tests/fixtures/vocab-diverge-smoke/
```

Adapter-level tests live alongside the source:

```bash
pnpm --filter @formtrieb/cdf-mcp test
```

These cover tool-handler behaviour against tempdir fixtures and the
spec-fragment resolution paths. Pure-function tests for parsers,
validators, and analyzers live in `cdf-core`:

```bash
pnpm --filter @formtrieb/cdf-core test
```

## Versioning

Scoped tags in the form `cdf-mcp-vX.Y.Z` mark releases. Tagged
versions align with the tool set — a minor bump adds tools or
backward-compatible argument fields; a major bump changes tool
signatures or semantics.

Related packages have their own tag namespaces (`cdf-vX.Y.Z` for the
format spec, `cdf-core-vX.Y.Z` when cdf-core starts tagging). There
is no lockstep; cdf-mcp can ship v1.5 while cdf-core is at v1.0.

## License

Apache-2.0 — alignment with the CDF spec and reference implementation.
