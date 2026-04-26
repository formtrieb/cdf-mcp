## 11. Accessibility defaults

A Profile declares **DS-wide accessibility conventions** so that every CDF Component
starts from a safe baseline. A CDF Component inherits these defaults implicitly; its
[§15 accessibility block](CDF-COMPONENT-SPEC.md#15-accessibility) overrides only what
deviates from the DS default.

The Profile-level defaults are organised into five blocks: focus indication,
interactive target sizing, contrast guarantees, keyboard behaviour per
interaction pattern, and per-category defaults.

### 11.1 Schema

```yaml
accessibility_defaults:

  focus_ring:                     # optional
    description: string
    pattern: string               # "ring" | "double-ring" | "outline" | custom
    token_group: string           # token grammar prefix for focus tokens

  min_target_size:                # optional
    token: string                 # token path for the minimum size value
    wcag_level: string            # "A" | "AA" | "AAA"
    description: string

  contrast_requirements:          # optional
    description: string
    {pairing_name}:               # named pairing blocks (see §11.4)
      description: string
      pairs:
        - foreground: string      # token path or pattern
          background: string      # token path or pattern
          ratio: string           # "4.5:1", "3:1", etc.
          wcag: string            # "A" | "AA" | "AAA"
          description: string

  keyboard_defaults:              # optional
    {pattern_name}:               # matches an §10 interaction_patterns key
      {key}: string               # key name → action name

  category_defaults:              # optional
    {category_name}:              # matches a §12 categories key
      focus_visible: boolean
      element: string             # default semantic HTML element
      roles: [string, ...]        # default ARIA roles
      aria: [string, ...]         # default ARIA attribute declarations
      aria_extensions: [string, ...]  # additional ARIA attrs the category
                                      #   commonly needs
      keyboard: string            # which interaction_pattern's keyboard
                                  # defaults apply
```

### 11.2 `focus_ring`

Describes how focus is indicated for focusable controls at a DS level.
Supported patterns:

- `ring` — single-ring outline
- `double-ring` — outer focus-colour + inner page-background ring
  (ensures visibility on any surface)
- `outline` — single CSS outline property
- any custom string — implementation-defined; consumers MUST have a
  matching renderer

`token_group` names the token grammar prefix where focus-related tokens
live (e.g. `focus` → tokens under `focus.*`). A Target generator uses this
to locate the outline colour, offset, width.

### 11.3 `min_target_size`

The minimum size of interactive targets, declared as a **token reference**
(not a fixed pixel value). Declaring a token rather than a number means
theming modifiers (esp. `device`) can scale it — Mobile gets larger
targets than Desktop through the device-modified token, without rewiring
the spec.

`wcag_level` records the WCAG level this default targets. SHOULD be `AA`
or stricter for production DSes.

### 11.4 `contrast_requirements`

Contrast guarantees hold **within designed pairings only**. Not every
foreground-background combination is accessible; only the ones the DS
explicitly pairs. This section enumerates those pairings.

Each named block lists `pairs:` — foreground token + background token +
ratio + WCAG level. A consumer MAY:

- validate generated output by resolving token paths and computing ratios
- surface the pairings in documentation (which text goes on which surface)
- reject Component token bindings that violate a pairing implicitly

Pairings MAY use `{placeholder}` patterns (from §6 token grammar). A
validator expands them into concrete pairs when resolving.

```yaml
contrast_requirements:
  controls_internal:
    description: "Text and icons inside filled controls."
    pairs:
      - foreground: "color.controls.{hierarchy}.text-on-color.{state}"
        background: "color.controls.{hierarchy}.background.{state}"
        ratio: "4.5:1"
        wcag: AA
```

### 11.5 `keyboard_defaults`

Per-interaction-pattern keyboard bindings. A component that adopts a
pattern (see [§10](#10-interaction-patterns)) inherits that pattern's
keyboard behaviour unless its Component overrides it.

Key names follow [W3C UI Events `KeyboardEvent.key`](https://w3c.github.io/uievents-key/)
(`Enter`, `Space`, `Tab`, `Escape`, `ArrowUp`, etc.). Action names are
DS-specific verbs — the Target translates them to platform idioms.

### 11.6 `category_defaults`

Per-category defaults, keyed by the categories declared in
[§12](#12-categories). Fields:

- `focus_visible` — whether the category's components participate in the
  focus ring
- `element` — the default semantic HTML element (Primitive → `span`,
  Action → `button`, Input → `input`)
- `roles` — default ARIA roles applied to the root
- `aria` — default ARIA attribute declarations (`aria-hidden: true` for
  purely decorative primitives)
- `aria_extensions` — ARIA attributes the category commonly needs but
  that individual components bind per-instance (`aria-invalid` for
  Inputs)
- `keyboard` — references a pattern from
  [`keyboard_defaults`](#115-keyboard_defaults)

### 11.7 How a CDF Component uses these defaults

A CDF Component MAY omit its `accessibility:` block entirely if the defaults for its
category suffice. When the block is present, its fields override the
category defaults at field granularity — not block granularity. Example:

```yaml
# Profile:     category_defaults.Actions = {element: button, focus_visible: true,
#                                           keyboard: pressable}
# Component:   accessibility.keyboard overrides; other fields inherit.
accessibility:
  keyboard:
    Enter: activate
    Space: activate
    ArrowDown: open_menu         # ← Component-specific, adds to inherited
```

> **Rule.** A Target generator MUST apply Profile defaults when the CDF Component is
> silent, and MUST apply CDF values when the CDF Component speaks. Defaults and
> overrides MUST NOT be silently merged across list values unless the
> field is explicitly declared additive (`aria_extensions` is additive;
> `roles` is not).

---

