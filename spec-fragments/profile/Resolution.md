### 6.12 `resolution` — when axes collapse into a token slot

A Component may declare multiple orthogonal state axes (e.g. `interaction`,
`validation`, `selected`) that each resolve tokens against the **same
token-grammar placeholder**. A flat `{state}` slot in
`color.controls.{hierarchy}.{element}.{state}` is shared by pressable
states (`hover`, `pressed`), focusable states (`active`), validation
values (`error`, `success`), and selection markers — because the DTCG
token file keeps all those values in one dimension.

When multiple Component axes contend for the same slot, a generator needs
a deterministic tie-breaker. The grammar declares one:

```yaml
token_grammar:
  color.controls:
    pattern: "color.controls.{hierarchy}.{element}.{state}"
    dtcg_type: color
    axes:
      hierarchy: { vocabulary: hierarchy }
      element:   { vocabulary: element }
      state:
        values: [enabled, hover, pressed, active, disabled, error, success, inactive]
    resolution:
      precedence: [validation, interaction, selectable]
      description: >
        When a Component resolves a token path and multiple state axes
        have non-default values, the axis earliest in this list wins
        the `{state}` slot. Example: a focused + error input resolves
        to `state = error` because validation outranks interaction.
```

#### 6.12.1 Rules

1. **`precedence:` is a list of Component axis names** (matching Profile
   `interaction_patterns` names). The first axis whose current value is
   non-default wins the slot.
2. **The rule is local to one grammar.** Different grammars MAY declare
   different precedences (rare, but legal).
3. **Axis default.** An axis contributes its value only when it is at a
   non-default state. `validation: none` does not participate; `selected:
   false` does not participate.
4. **Fall-through.** If no axis in the precedence list is active, the
   slot takes the first axis's declared `default` — conventionally
   `interaction: enabled`.
5. **Required when collapsed axes exist.** A grammar whose `{state}` slot
   is declared to accept values from more than one Profile pattern MUST
   declare `resolution:`. Validators reject grammars that allow
   collapse without a precedence rule (`CDF-STR-013` in Component §18.3).

#### 6.12.2 Why this lives in the grammar, not in the Component

The collapse is a **rendering** concern, not a Component-authoring
decision. Every Component that uses `color.controls` inherits the same
precedence — a checkbox and an input both follow `validation >
interaction`. Putting the rule in the Component would let each Component
pick its own tie-breaker, which is exactly the inconsistency this format
is built to prevent.

---

---

