## 12. Categories

A Profile declares the **component categories** the DS organises around.
Every Component's `category:` field MUST name one of these categories. Categories
carry three kinds of information:

1. **Organisational** — how the DS groups components for documentation and
   browsing.
2. **Behavioural** — what kind of interaction the category implies
   (`interaction: none | pressable | focusable`).
3. **Token-grammar binding** — which `token_grammar` grouping a component
   of this category typically draws from.

A CDF Component's category is the primary signal for consumers — a validator can
check, from category alone, that a `Primitives` component does not declare
interactive states, or that a `Status` component binds to
`color.system-status` rather than `color.controls`.

### 12.1 Schema

```yaml
categories:
  {CategoryName}:                 # REQUIRED — PascalCase
    description: string           # REQUIRED
    interaction: string           # REQUIRED — "none" | an
                                  #   interaction_patterns key
    token_grammar: string         # optional — token grammar prefix that
                                  #   this category typically uses
    examples: [string, ...]       # optional — known component names
```

### 12.2 `interaction`

The **primary** interaction pattern of the category — a default that the
Component uses when it declares no own interaction pattern. Values:

- `none` — non-interactive (no hover, press, focus). Primitives and Status
  typically use `none`.
- `pressable` — direct click/tap targets; see [§10 `pressable`](#10-interaction-patterns).
- `focusable` — keyboard-focusable; see §10 `focusable`.

**This is a default, not a constraint.** A Component in a category MAY
declare additional interaction patterns beyond the category default,
particularly when the Profile's `orthogonal_to:` mechanism applies:

- An `Inputs` category (default `focusable`) may contain a **Checkbox** that
  is `selectable` + `pressable` — per §10 `selectable.orthogonal_to:
  [pressable, focusable]`, `selectable` composes with either of the
  axial patterns. Here Checkbox overrides the default, choosing `pressable`
  as its base (click-feedback like a button) plus `selectable` as an
  orthogonal axis.
- An `Actions` category (default `pressable`) may contain a **ToggleButton**
  that is `pressable` + `selectable` — same composition rule.
- An `Overlays` category (default `focusable`) may contain a **Dialog** that
  is `focusable` + `expandable`.

**Conflict rule.** A Component MUST NOT declare an interaction pattern that
contradicts its category default — e.g. an `Actions` component declaring
only `focusable` (without `pressable`) is inconsistent. Additive composition
via `orthogonal_to:` is permitted and expected; wholesale replacement is
not.

Validators MAY warn when a Component's declared interaction patterns neither
match the category default nor compose with it via `orthogonal_to:`.

### 12.3 `token_grammar`

Optional: the canonical token-grammar prefix (from [§6](#6-token-grammar))
that components in this category draw from. Declaring this lets validators
flag cases like a `Primitives` component accidentally bound to
`color.controls.*` (controls tokens are reserved for interactive
categories).

If a category has no canonical grammar binding (`Layout` components vary),
omit the field.

### 12.4 `examples`

Informational. Lists known component names in this category. Not normative
— a component's category is declared by the CDF Component Component's `category:` field, not
by appearing in a Profile's `examples`. Consumers MAY surface this list
in documentation.

### 12.5 Extension semantics

An extending Profile ([§15](#15-profile-extension)) MAY:

- Add new categories.
- Override a category's `description` or `examples`.
- MUST NOT change a category's `interaction` value — doing so would
  invalidate existing CDFs downstream.

### 12.6 Example (abbreviated from Formtrieb)

```yaml
categories:

  Primitives:
    description: "Atomic visual elements without interactive behaviour."
    interaction: none
    examples: [Icon, LoadingSpinner]

  Actions:
    description: "Clickable controls that trigger operations."
    interaction: pressable
    token_grammar: color.controls
    examples: [Button, IconButton]

  Inputs:
    description: "Controls for data entry and selection."
    interaction: focusable
    token_grammar: color.controls
    examples: [TextField, ComboBox, ToggleSwitch]

  Status:
    description: "Read-only indicators showing system state."
    interaction: none
    token_grammar: color.system-status
    examples: [StatusChip, Badge]

  Layout:
    description: "Structural components for page organisation."
    interaction: none
    # No canonical token_grammar — Layout components vary widely.
    examples: [Divider, Accordion, Pagination]

  Overlays:
    description: "Popover containers for transient content."
    interaction: none
    examples: [PopoverMenu, Tooltip, Modal]
```

---

---

