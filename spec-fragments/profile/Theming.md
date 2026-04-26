## 8. Theming

A Profile declares the **theming modifiers** a DS responds to. A modifier
is an axis — `semantic`, `device`, `shape` — whose active context
switches token values across the whole DS.

Modifiers differ from CDF Component state axes:

- **Modifier** — DS-wide, applied to a context boundary (document root or a
  subtree). Affects many components at once. Switched by a host attribute,
  class, or framework-level mode.
- **State axis** — per-component, describes runtime interaction state.
  Applied to one component at a time.

### 8.1 Schema

```yaml
theming:
  modifiers:                      # REQUIRED — one entry per axis
    {modifier_name}:
      description: string         # REQUIRED
      contexts: [string, ...]     # REQUIRED — legal values, ordered
      default: string             # optional — MUST be in `contexts`
      required: boolean           # optional — default false
      data_attribute: string      # optional — "data-{modifier}" convention
      css_class_pattern: string   # optional — alternative to data_attribute
      figma_collection: string    # optional — Figma variable collection name
      affects: [string, ...]      # optional — token-grammar prefixes this
                                  #            modifier may override

  set_mapping:                    # REQUIRED if `token_sources.sets` present
    {set_path}:                   # — path without .json, matching a §7.4 entry
      modifier: string            # OR — names a §8.1 modifier
      context: string             #     — one of that modifier's contexts
      always_enabled: boolean     # OR — set is always active
```

### 8.2 `modifiers`

Each modifier is an axis that consumers toggle at runtime (or build time).
Rules per field:

- **`description`** — explains what the modifier controls. SHOULD answer
  "which token families does this modifier swap?" in one sentence.
- **`contexts`** — ordered list of legal values. Order is normative
  (documentation tools MAY rely on it).
- **`default`** — if declared, MUST be one of `contexts`. Consumers apply
  this when no explicit context is set.
- **`required`** — `true` means every context boundary MUST pick a value;
  `false` means the modifier MAY be absent (falls back to DS defaults in
  the DTCG resolver).
- **`data_attribute`** — the HTML attribute name (e.g. `data-semantic`)
  that carries the active context. CSS selectors of the form
  `[data-semantic="Dark"]` switch token values. A modifier MAY use
  `css_class_pattern` instead (e.g. `theme-{context}`).
- **`figma_collection`** — the Figma Variables collection name that
  represents this modifier's modes. Consumed by Figma target / Figma MCP
  tooling.
- **`affects`** — optional list of token-grammar prefixes (from §6) whose
  values this modifier is allowed to override. A consumer MAY warn if a
  token-set under `set_mapping` touches a grammar not listed in `affects`.

### 8.3 `set_mapping`

Connects each token set file (from [§7.4 `sets`](#74-sets)) to a modifier
context. Three shapes:

```yaml
# 1. Set is always active (no modifier switches it off)
"Foundation/Foundation": { always_enabled: true }

# 2. Set is activated by a specific modifier context
"Semantic/Light": { modifier: semantic, context: Light }
"Semantic/Dark":  { modifier: semantic, context: Dark }

# 3. Wildcard — all sets under a prefix follow the same rule
"Components/*": { always_enabled: true }
```

Rules:

1. Every set listed in `token_sources.sets` MUST appear in `set_mapping`
   (directly or via wildcard), or be covered by a catch-all.
2. A set with `modifier` + `context` is only resolved when that modifier is
   set to that context. When the modifier is set to a different context,
   the set is **not included** in the resolved token tree.
3. A modifier's context MUST match one of the declared `contexts` values
   for that modifier.

### 8.4 How modifiers compose with token paths

A CDF Component token reference does **not** include modifier placeholders. The CDF
writes `color.controls.brand.background.hover` — not
`color.controls.{semantic}.brand.background.hover`. The active modifier
context is resolved by the DTCG layer: the `Semantic/Light` and
`Semantic/Dark` sets both contain a `color.controls.brand.background.hover`
entry with different `$value`s; the resolver picks one based on which set
is active.

This separation keeps CDF Components **modifier-agnostic**. A Button spec works
in any semantic theme — the theme-switching mechanism is orthogonal.

> **Consequence for generators.** Generators emit styling that switches on
> the `data_attribute` (or class) pattern. The CSS generator does not
> expand per-modifier at build time; the browser picks the right value at
> runtime via the DTCG resolver's output (typically CSS custom properties
> scoped under `[data-semantic="Light"]` and `[data-semantic="Dark"]`).

### 8.5 Example (abbreviated from Formtrieb)

```yaml
theming:
  modifiers:
    semantic:
      description: "Color mood — light or dark appearance"
      contexts: [Light, Dark]
      default: Light
      required: true
      data_attribute: data-semantic
      affects: [color.controls, color.interaction, color.surface, color.text]

    device:
      description: >
        Viewport class. Controls dimensions (heights, spacing) and
        typography sizes. Does NOT change color.
      contexts: [Desktop, Tablet, Mobile]
      default: Desktop
      required: false
      data_attribute: data-device
      affects: [controls.height, spacing.component, typography]

    shape:
      description: "Border radius strategy"
      contexts: [Round, Sharp]
      default: Round
      required: false
      data_attribute: data-shape
      affects: [radius]

  set_mapping:
    "Foundation/Foundation": { always_enabled: true }
    "Semantic/Light":        { modifier: semantic, context: Light }
    "Semantic/Dark":         { modifier: semantic, context: Dark }
    "Device/Desktop":        { modifier: device,   context: Desktop }
    "Shape/Round":           { modifier: shape,    context: Round }
    "Components/*":          { always_enabled: true }
```

---

