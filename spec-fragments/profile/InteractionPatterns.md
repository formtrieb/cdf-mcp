## 10. Interaction patterns

An **interaction pattern** is a named, canonical shape for a component's
runtime state. Patterns are defined in the Profile so that every focusable
input has the same state axis, every pressable button has the same state
axis — components do not re-invent the vocabulary.

A CDF Component does not have to adopt a pattern verbatim (a Component MAY define its
own states); but components that use a recognised pattern SHOULD reference
it by name so validators can enforce consistency.

### 10.1 Schema

```yaml
interaction_patterns:
  {pattern_name}:                 # REQUIRED — snake_case
    description: string           # REQUIRED
    states: [string, ...]         # REQUIRED — component-facing state names
    token_layer: string           # optional — name of an entry in
                                  #            §6.10 `token_layers:` (NOT
                                  #            a grammar key from §6).
                                  #            Validators reject grammar
                                  #            keys here.
    token_mapping:                # optional — component-facing → token-path
      {component_state}: {path_state}
    orthogonal_to: [string, ...]  # optional — other patterns this composes
                                  #            with
    promoted: [string, ...]       # optional — states promoted to DOM
                                  #            attributes by default
    notes:                        # optional — per-state rationale
      {state}: string
```

### 10.2 `states`

The ordered list of state names **as consumers see them**. These are the
values a CDF Component state axis declares:

```yaml
# in a CDF Component Component
states:
  interaction:
    description: "Input focus cycle"
    values: [enabled, hover, focused, disabled]   # ← matches `focusable`
    default: enabled
```

State order is normative — it determines default rendering order in
documentation tools (Storybook grids, Figma variant rows).

### 10.3 `token_layer`

Optional reference to a **token layer** — i.e. an entry in the
Profile's [`token_layers:`](#610-token_layers--reference-cascade-between-grammar-groups) list (`name:` of one of the
declared layers, e.g. `Controls`, `Interaction`, `Foundation` in
Formtrieb's setup). It is **not** a token-grammar key (e.g.
`color.controls`); a validator running L4 (cross-field structural)
rejects a `token_layer:` value that does not match a declared layer
name.

The reason is one of indirection: a layer groups one or more grammars
plus standalone tokens, and patterns bind to that grouping rather
than to a single grammar. A pressable Button reading from `Controls`
can pull from any of `color.controls`, `radius.controls`, etc., via
the same layer reference; pinning the pattern to one grammar would
break that.

A validator MAY use this to check that a CDF Component using the
`pressable` pattern reads from a grammar inside the `Controls` layer
rather than reaching into `Interaction` or `Foundation` directly.

### 10.4 `token_mapping`

The **translation layer** between component-facing state names and the
state segment in token paths (see [§6.9](#69-token-path-state-names-vs-component-state-names)).
Each key is a state name from `states:`; each value is the corresponding
`{state}` placeholder value in the token grammar.

```yaml
focusable:
  states: [enabled, hover, focused, disabled]
  token_mapping:
    enabled:  enabled
    hover:    hover
    focused:  active        # ← component says "focused", token path says "active"
    disabled: disabled
```

Identity mappings MAY be omitted; a consumer assumes `x → x` when the key
is absent. Only non-identity mappings MUST be declared.

**Why this exists.** The token system was designed around a single
`{state}` axis that covers both pressable and focusable components
(`active` is the "actively-in-use" state for both). Consumer-facing state
names were chosen per pattern for clarity — buttons are `pressed`,
inputs are `focused`. The mapping bridges the two without forcing either
to match the other.

**Precedence.** A single CDF Component may override this Profile-level
mapping at the state axis (Component §8.5) or at a property (Component §7.6).
Resolution order for any given name: state-level → property-level → this
pattern-level entry. See CDF Component §8.5 *Precedence across levels* for
the full rule and edge cases.

### 10.5 `orthogonal_to`

Lists other patterns with which this one composes. An orthogonal pattern
is a separate axis that multiplies with the base: a Checkbox is both
`pressable` (can be clicked, hovered, pressed, disabled) and `selectable`
(has a selected/unselected state). Both axes apply simultaneously.

A CDF Component that declares both patterns' state axes generates the Cartesian
product of states:

```
pressable:    [enabled, hover, pressed, disabled]
selectable:   [selected, unselected]
→ 4 × 2 = 8 state combinations (orthogonal grid, not a flat enum)
```

### 10.6 `promoted`

> **Concept ↔ Target.** `promoted:` is the abstract, DS-level half of the
> same concept whose concrete, framework-level half is CDF Target
> `state_to_input:` (Target §13). Profile declares *that* a state crosses
> the boundary; Target declares *how*. A consumer reads both together.

Lists state values or entire axes that are **externally observable** — that
is, exposed at the component boundary rather than kept internal to the
component's implementation.

An observable state is one that:

- A parent component or runtime environment can set (or influence).
- Assistive technology needs to read.
- Other components in the tree can react to via relationship queries
  (selector, environment, ancestor bindings).

`promoted:` names the states this pattern expects to expose. It does **not**
name *how* they are exposed — that is a per-Target decision (DOM attribute
for Web, `@Binding` for SwiftUI, template variable for Kirby, etc.).

Canonical observable markers:

| State / axis          | Meaning at the boundary                          |
| --------------------- | ------------------------------------------------ |
| `disabled`            | Component is non-interactive; consumers + a11y must know |
| `focused`             | Component has input focus; observable via platform focus APIs |
| `validation: error`   | Component reports an invalid state; consumers + a11y must know |
| `open` (expandable)   | Component is in its expanded state; consumers may react |

Each Target maps these markers to its own concrete mechanism. See
[CDF Target §13](CDF-TARGET-SPEC.md#13-state--input-promotion) for the Web
mapping (DOM attributes + ARIA) and for how a Target declares its mapping
table.

> **Why abstract here and concrete in Target.** The Profile describes
> the DS's interaction contract independently of any framework. "This
> state crosses the boundary" is a DS-level claim — it holds for every
> Target. *How* the boundary-crossing is realised (DOM, SwiftUI binding,
> Figma property) is framework-specific.

#### Auto-promotion of mirrored states

A CDF Component state axis paired with a `mirrors_state:` property
(CDF Component §7.11) is **automatically observable at the component
boundary** — the consumer-facing property IS the boundary crossing.
Profile `promoted:` does not need to list the mirrored state separately;
listing it is allowed but redundant. Validators MAY surface duplicate
listings as info-level reminders (`CDF-INF-00X`).

This rule keeps the boundary contract honest without forcing
double-bookkeeping: a Checkbox declaring `properties.checked.mirrors_state:
selected` carries the `selected` axis across the boundary by the property
alone — no need for `selectable.promoted: [selected]` to repeat it.

### 10.7 Example (abbreviated from Formtrieb)

```yaml
interaction_patterns:

  pressable:
    description: >
      Direct click/tap targets — buttons, tags, toggles. Full cycle:
      rest → hover → press → release.
    states: [enabled, hover, pressed, disabled, pending]
    token_layer: Controls
    token_mapping:
      # identity mappings elided (enabled, hover, pressed, disabled)
      pending: enabled           # pending has no dedicated token state
    promoted: [disabled]
    notes:
      pending: >
        No dedicated token state. Visual treatment is enabled + spinner +
        opacity.disabled overlay.

  focusable:
    description: >
      Keyboard-focusable controls — inputs, selects, textareas.
    states: [enabled, hover, focused, disabled]
    token_layer: Controls
    token_mapping:
      focused: active            # token system calls focused "active"
    promoted: [disabled, focused]

  selectable:
    description: >
      Binary or tri-state selection — checkboxes, radios, selection tags.
    states: [selected, unselected]
    orthogonal_to: [pressable, focusable]
    promoted: [selected]
    notes:
      token_mapping_pattern: >
        `selectable` does NOT declare a Profile-level `token_mapping:` because
        how the selected axis projects onto token paths depends on the
        component's visual structure:

        **Flat selectables** (SelectionTag, Chip, ToggleButton) keep one
        element-surface and switch its state segment. These components MAY
        map `selected: active` — treating "selected" as a variant of
        "active" on the same background/text/icon elements.

        **Surface-swap selectables** (Checkbox, Radio) paint different
        anatomy elements depending on `selected`: stroke-only when
        unselected, filled background when selected. These components do
        NOT apply a token_mapping; they emit separate token bindings per
        anatomy part with boolean-qualified modifier overrides
        (Component §13.2).

        The Component spec's `states.selected.token_mapping:` (Component
        §8.5) is the normative override — components declare their own
        mapping when it applies, and omit it when surface-swap is used.

  expandable:
    description: >
      Open/closed state controlling content visibility — accordions,
      dropdowns, combo boxes.
    states: [open, closed]
    orthogonal_to: [pressable, focusable]
    promoted: [open]             # conventionally [aria-expanded]

  validation:
    description: >
      Form-validation state. Not an interaction in the user-event sense;
      rather, the DS concept "is this field's content acceptable?". Always
      orthogonal to pressable / focusable / selectable (never folded into
      an interaction axis — see §10.8).
    states: [none, error, success]
    default: none
    orthogonal_to: [pressable, focusable, selectable]
    promoted: [error]            # conventionally [aria-invalid="true"]
    notes:
      none: "No validation signal. The field is in its baseline presentation."
      semantic_note: >
        Validation is a reserved vocabulary. Values `error` and `success`
        MUST NOT appear in interaction / selectable / expandable axes on
        any Component — the Profile isolates them to this pattern.
        See §10.8.
```

---

### 10.8 The `validation` pattern is reserved

`validation` is the first pattern in this Profile spec declared as
**reserved vocabulary** (§5.5 rule 5). Its values (`error`, `success`,
plus any Profile extensions like `warning`, `pending`) are exclusive to
validation axes — a Component that lists `error` in its `interaction`,
`selectable`, or `expandable` state axis is structurally invalid.

**Why this specifically.** Validation reads differently from interaction
states:

- Interaction describes **user event sources** (pointer, keyboard focus).
- Validation describes **form-content status** (is the input acceptable).

Mixing them into one axis collapses two independent concerns into one
slot — a representational shortcut that Figma variant matrices encourage
but the format rejects. A Component in the same DS that models Input
with orthogonal validation and Checkbox with folded validation is
internally inconsistent; CDF's job is to prevent that.

**Rendering.** The token grammar may still have a flat `{state}` slot
(Formtrieb's `color.controls.*.{state}` with `error` and `success` as peer
values). When multiple axes resolve into the same token slot, the
grammar's `resolution:` precedence (§6.12) picks which axis wins. This
keeps tokens pragmatic while keeping the API surface strict.

**Extension.** A Profile extending another MAY add new validation values
(e.g. `warning`, `pending`). Removing inherited validation values is a
major-version change (Profile §15).

**Cross-refs:** CDF Component §18.3 `CDF-STR-011`,
[Token grammar §6.12](#612-resolution-when-axes-collapse-into-a-token-slot).

---

