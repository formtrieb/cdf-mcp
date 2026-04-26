### 6.10 `token_layers` — reference cascade between grammar groups

A mature token system is not flat: foundation palettes feed into semantic
palettes feed into component-ready tokens. `token_layers:` declares this
**reference cascade** explicitly so validators (and LLMs) can check that a
token in one layer only references tokens in a layer it is allowed to
reach.

#### 6.10.1 Schema

```yaml
token_layers:
  - name: string                # REQUIRED — layer identifier
    description: string         # REQUIRED — what this layer contains
    grammars: [string]          # optional — grammar pattern names
                                # (keys from §6) that belong to this layer
    references: [string]        # optional — layer names this layer may
                                # reference in its token values
```

Layers are an ordered list. Conventionally the first entry is the
"foundation" (no `references:`) and the last is the outermost
consumer-facing layer (may reference any layer above it).

#### 6.10.2 Rules

1. **Every name is unique within the list.** Duplicate layer names are a
   Profile-validation error.
2. **`grammars:` entries MUST exist in `token_grammar:`.** A layer
   referencing a grammar pattern that doesn't exist is rejected.
3. **`references:` entries MUST exist in `token_layers:`.** Forward
   references (referring to a layer defined later) are permitted because
   the list is a DAG, not a sequence.
4. **No cycles.** The transitive closure of `references:` MUST be a DAG.
   Validators reject cycles.
5. **A grammar pattern belongs to at most one layer.** If `color.controls`
   is listed under layer `Controls`, it cannot also be listed under
   `Interaction`.
6. **Empty `grammars: []` is legal.** A layer MAY contain only standalone
   tokens (§6.11) or serve as a reference target without owning any
   grammar pattern.

#### 6.10.3 Semantics — what the cascade enforces

When a token's `$value` references another token, the referenced token
MUST live in:

- the same layer (self-references within a layer are permitted), OR
- a layer listed in the current layer's `references:` (transitively).

A token in `Controls` that references a `Foundation` token is only legal
if `Foundation` is reachable from `Controls` via `references:`
(directly or transitively).

> **Enforcement responsibility.** CDF validators check this when loading
> the referenced DTCG token files. The Profile's `token_layers:` is the
> **contract**; the DTCG resolver (outside the Profile spec) is the
> **enforcer**.

#### 6.10.4 Example (Formtrieb)

```yaml
token_layers:
  - name: Foundation
    description: >
      Raw color scales, dimensions, typography primitives. Never used
      directly by components — always referenced through higher layers.
    grammars: []

  - name: Interaction
    description: >
      Semantic palette. Selects from Foundation and assigns meaning
      (colorway + intensity).
    grammars: [color.interaction]
    references: [Foundation]

  - name: Controls
    description: >
      Component-ready tokens. Each hierarchy × element × state combination
      resolves to a specific Interaction token.
    grammars: [color.controls, color.system-status]
    references: [Interaction]

  - name: Components
    description: >
      Component-specific overrides and tokens that don't fit the Controls
      grid (focus ring, overlay colors, inputGroup spacing).
    grammars: []
    references: [Controls, Interaction]
```

A `color.controls.primary.background.hover` token is in `Controls`. It
MAY resolve to a `color.interaction.brand.700` token (reachable via
`Controls → Interaction`) but MAY NOT directly resolve to a raw
Foundation token — it must go through Interaction first. This is the
rule that makes a DS recolor-able: change Interaction, all Controls
follow.

#### 6.10.5 Omission and defaults

`token_layers:` is **optional**. A Profile that omits it is declaring
"my tokens form a single flat reference graph, no cascade enforcement".
Validators do not attempt to infer layers from token paths.

A Profile that ships token_layers MUST cover every grammar pattern it
owns. Grammar patterns not named in any layer are a validation warning
(not an error) — the Profile may intentionally treat them as unlayered.

#### 6.10.6 Extension semantics

A Profile extending another (§15) MAY add new layers or add to existing
layers' `grammars:`/`references:` — but MAY NOT remove layers the parent
declared, nor remove entries from `grammars:`/`references:` lists.
Rationale: removal would invalidate downstream tokens without warning.

