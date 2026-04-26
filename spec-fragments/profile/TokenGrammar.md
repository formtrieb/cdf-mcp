## 6. Token grammar

The token grammar declares **which token paths are legal in this DS** and
**what each path segment means**. It is the contract between the DS's DTCG
token files and every CDF Component that references them.

> **The Profile ↔ Component token interplay.** The Profile is the *grammar*;
> CDF Components are *sentences* that follow the grammar. A CDF Component
> writes token paths
> with placeholders — `color.controls.{hierarchy}.background.{interaction}` —
> where some placeholders (`{hierarchy}`) bind to a component *property*,
> and others (`{interaction}`) bind to a component *state axis*. Generators
> and validators expand these to concrete paths and verify they exist in the
> DTCG token files.

**Build-time enumerability.** A Profile's `token_grammar` declares which
token paths exist in this DS. A conforming DTCG token tree provides a static
value for each resolved path at **token-build time**. CDF does not describe
dynamic token resolution — paths are enumerable at build time, and each
enumerated path corresponds to one DTCG value. This invariant is what makes
the token-driven principle ([CDF Component §1.1 #2](./CDF-COMPONENT-SPEC.md#11-design-principles))
enforceable: a Component that references a grammar-covered path can trust
that the path resolves to a value, without needing to know how the DS's
toolchain produced that value.

### 6.1 Schema

```yaml
token_grammar:
  {grammar_name}:                 # REQUIRED — dotted canonical prefix
                                  #            (e.g. "color.controls")
    pattern: string               # REQUIRED — path template with {axis}s
    dtcg_type: string             # REQUIRED — DTCG $type for all tokens
                                  #            matching this grammar
    description: string           # REQUIRED
    axes:                         # REQUIRED — one entry per {axis} in pattern
      {axis_name}:
        vocabulary: string        # OR — references a named vocabulary
        values: [string, ...]     # OR — inline values
        description: string       # optional — required if `values:` inline
        notes: {value: string}    # optional
    contrast_guarantee: string    # optional — see §6.5
```

**Headless DS shape.** A Profile with no visual contract MAY declare
`token_grammar: {}`. Every downstream reference to a grammar — in
[`token_layers`](#610-token_layers--reference-cascade-between-grammar-groups),
`interaction_patterns.token_layer` ([§10.3](#103-token_layer)),
`categories.token_grammar` ([§12.3](#123-token_grammar)), and a CDF
Component's `tokens:` block ([CDF-COMPONENT-SPEC §13](./CDF-COMPONENT-SPEC.md#13-tokens))
— becomes correspondingly optional. This is the canonical shape for
Headless DSes (Radix Primitives, Reach UI, Material Web Headless) that
delegate all styling to consumers. Validators MUST accept the empty
map; `token_expandable` on state axes defaults to `false` and the
required-field check is waived (see CDF-STR-004 carve-out).

### 6.2 `pattern`

A dotted path template. Placeholders in curly braces reference entries in
`axes:`. The placeholder order defines the canonical path order.

```yaml
pattern: "color.controls.{hierarchy}.{element}.{state}"
```

Rules:

1. Placeholder names MUST match `[a-z][a-z0-9_]*`.
2. Every placeholder MUST have an entry in `axes:`.
3. Non-placeholder segments are **literal** — they appear in every resolved
   path (e.g. `color.controls` is literal; only the three `{…}` vary).
4. Two grammars MUST NOT share a pattern; they MAY share a canonical prefix
   if placeholder sets differ.

### 6.3 `dtcg_type`

The DTCG `$type` that every token matching this grammar declares. Consumers
MAY use this to type-check token usage in Components (e.g. a `color:` CSS property
must receive a token with `dtcg_type: color`).

Currently used: `color`, `typography`, `dimension`, `shadow`, `border`,
`duration`, `cubicBezier`, `number`, `fontFamily`, `fontWeight`.

### 6.4 `axes`

Each axis declares either `vocabulary:` (reference) or `values:` (inline).

- **Vocabulary reference** — preferred when the set is reused across
  grammars or in CDF Component properties.
- **Inline values** — appropriate when the set is grammar-specific (e.g.
  `level: [base, level1, level2, level3]` in `color.surface`).

An axis with inline values SHOULD include `description:` so its meaning is
self-contained.

### 6.5 `contrast_guarantee` (optional)

A prose declaration of WCAG contrast properties guaranteed by tokens matching
this grammar. Consumed by accessibility validators and surfaced in
documentation.

```yaml
color.text:
  contrast_guarantee: >
    color.text.primary and color.text.secondary are guaranteed accessible
    (4.5:1) on all color.surface.* backgrounds.
```

### 6.6 How a CDF Component references tokens

A CDF Component writes `tokens.{anatomy_part}.{css_property}: {token-path}`. The path
MAY contain placeholders in curly braces:

```yaml
# in a CDF Component Component
tokens:
  container:
    background: color.controls.{hierarchy}.background.{interaction}
    border-color: color.controls.{hierarchy}.stroke.{interaction}
```

Placeholder resolution rules:

1. A placeholder name that matches a property name (e.g. `{hierarchy}`) is
   bound to that property's value. `hierarchy: brand` →
   `color.controls.brand.background.{interaction}`.
2. A placeholder name that matches a state axis (e.g. `{interaction}`) is
   resolved per state value. The grammar declares `state_expandable` via the
   axis's `token_expandable` flag in the Component
   (see [Component §8 States](CDF-COMPONENT-SPEC.md#8-states)).
3. Unbound placeholders are a validation error.

### 6.7 Pattern-aware validation

From the grammar alone, a validator can:

1. **Enumerate legal paths.** `color.controls` admits
   |hierarchy| × |element| × |state| = 4 × 6 × 10 = 240 tokens.
2. **Reject unknown paths.** `color.controls.marketing.background.hover`
   fails — `marketing` is not in `hierarchy`.
3. **Verify completeness.** Every path the grammar predicts SHOULD exist in
   the DTCG token files; gaps MAY be surfaced as warnings.
4. **Type-check Component token usage.** A CDF Component that assigns a `typography` token
   to a `color` CSS property is rejected.

### 6.8 Axis-order significance

Different grammars MAY place shared placeholders in different positions.
Compare:

```yaml
color.controls:      pattern: "color.controls.{hierarchy}.{element}.{state}"
color.system-status: pattern: "color.system-status.{intent}.{element}.{hierarchy}"
```

In `color.controls`, `hierarchy` is the primary differentiator. In
`color.system-status`, `intent` leads, with `hierarchy` as a minor axis.
This reflects how the DS reasons about each token family — controls are
picked by hierarchy first, status indicators by intent first.

Axis order is normative: a CDF Component MUST write path segments in the order the
grammar declares.

### 6.9 Token-path state names vs. component state names

The state axis of a token grammar MAY use a different vocabulary than the
corresponding CDF Component state axis. Example: `color.controls`'s `state` includes
`active` (used for focused components), while a CDF Component focusable component
declares its state axis as `interaction: [enabled, hover, pressed, focused,
disabled]`.

Profiles SHOULD declare this translation once via
[interaction patterns](#10-interaction-patterns). CDFs SHOULD NOT invent
per-spec translations.

