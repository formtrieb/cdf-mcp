## 5. Vocabularies

A **vocabulary** is a named, ordered set of canonical values. Vocabularies
are the *alphabet* from which legal token paths and legal Component property
values are formed.

Vocabularies are referenced:

- From [`token_grammar`](#6-token-grammar) — an axis declares
  `vocabulary: hierarchy` to pull the set `[brand, primary, secondary,
  tertiary]`.
- From [Component properties](CDF-COMPONENT-SPEC.md#7-properties) — a property declares
  `type: enum`, `values: [brand, primary, secondary, tertiary]`; a
  profile-aware validator MAY recognise these as a vocabulary instance.
- From [Component state axes](CDF-COMPONENT-SPEC.md#8-states) — axis values SHOULD come
  from a vocabulary or from the Profile's
  [interaction patterns](#10-interaction-patterns).

### 5.1 Schema

```yaml
vocabularies:
  {name}:                         # REQUIRED — snake_case key
    description: string           # REQUIRED — why this vocabulary exists
    values: [string, ...]         # REQUIRED — ordered list of canonical values
    casing: string                # optional — lowercase | PascalCase | kebab
    aliases:                      # optional — synonyms recognised by
      {alt_name}: {canonical}     #            validators but emitted as
                                  #            canonical in generated output
    per_category:                 # optional — see §5.4
      {category}: [string, ...]
    notes:                        # optional — key → note pairs
      {value}: string
```

### 5.2 `description`

A one-paragraph explanation of **what the vocabulary means**, not what its
values are. The purpose is to let an LLM understand *why this set exists*
without cross-referencing a component.

> Good: "Visual emphasis levels for interactive controls. Higher hierarchy
> = more visual weight."
> Bad: "brand, primary, secondary, tertiary."

### 5.3 `values`

An ordered list of canonical strings. **Order is normative**: consumers MAY
rely on it (e.g. rendering hierarchy choices from strongest to weakest in
documentation tools).

Values are case-sensitive. If a vocabulary documents a specific casing via
`casing:`, every value MUST match.

### 5.4 `per_category` — variant shapes

Some vocabularies are **variant-shaped**: the set of legal values depends on
a containing category. Example: typography `name` depends on the `category`:

```yaml
typography:
  pattern: "Typography.{category}.{name}"
  axes:
    category:
      values: [Display, Title, Body, Label, Caption]
    name:
      per_category:
        Display: ["Display 1", "Display 2", "Display 3"]
        Title: ["Title 1", "Title 2", "Title 3"]
        Body: [Base, Large]
        Label: [Large, Base, Small]
```

A consumer validating `Typography.Display.Base` MUST reject it — `Base` is
not a legal `name` when `category: Display`.

### 5.5 Rules

1. **Uniqueness:** Within one vocabulary, values MUST be unique.
2. **Cross-vocabulary overlap:** Values MAY appear in multiple vocabularies
   with different meanings (e.g. `primary` in both `hierarchy` and
   `intensity`). Consumers disambiguate by context (axis binding).
   *Canonical example from foreign-DS validation:* Material 3's FAB has
   variants `[primary, secondary, tertiary, surface]` whose names are
   **identical** to values in the `color_role` vocabulary — because in
   Material a FAB's "variant" IS its colour role. Similarly,
   `[small, medium, large]` appears in both the `size` vocabulary
   (Button/FAB) and the `typography_scale` vocabulary. Rule 5 (reserved-
   namespace isolation) applies only when a value is in **exactly one**
   vocabulary — so both Material overlaps are legal. `binds_to:` on the
   Component property is what makes the disambiguation machine-
   readable. This cross-vocabulary pattern is unusual in flat /
   single-vocabulary DSes (shadcn, Primer) and becomes first-class in
   rich DSes like Material 3 where vocabularies carry semantic families.
3. **Extension:** An extending Profile MAY add values to an inherited
   vocabulary but MUST NOT remove them without a major version bump.
4. **Vocabulary as type:** A Component property may declare `type: hierarchy`
   instead of `type: enum` + `values: [...]`. Profile-aware validators
   resolve the type to the vocabulary values.
5. **Reserved-namespace isolation (API level).** A value that belongs to
   exactly one vocabulary MUST NOT appear in a Component `properties.*.values`
   or `states.*.values` list **unless that axis is bound to the owning
   vocabulary** (same name, or explicit `binds_to:` declaration — see
   CDF Component §7/§8). Mixing a vocabulary's values into an axis that
   does not speak its name is a Tier-1 validator error
   (`CDF-STR-011` in CDF Component §18.3). The rule applies only to
   **properties and states** — Token paths are not subject to it, because
   tokens are the implementation layer and a Profile's `token_grammar`
   closure is sufficient there.

> **Why isolation is hard.** Without this rule, two Components in the same
> DS can spell validation in incompatible ways — one as a separate axis,
> one folded into interaction — and a consumer cannot predict which. The
> Profile is the DS's constitution (Architecture §3.4); its vocabularies
> only constrain behaviour if they are enforced. This rule is the
> enforcement mechanism for property- and state-level API surface.

### 5.6 Token-key naming vs. semantic-API naming

A DS's component library MAY expose a property API whose values differ
from the underlying token keys. Concrete example: Primer-React's `Label`
component exposes `variant=accent | success | attention | severe |
danger | done | sponsors`, while the underlying token tree
(`@primer/primitives/src/tokens/component/label.json5`) keys by colour:
`label.blue`, `label.green`, `label.yellow`, `label.orange`,
`label.red`, `label.purple`, `label.pink`. The semantic-to-colour
mapping (`accent → blue`, `success → green`, …) lives inside the
component library (`Label.tsx`), not the token tree.

A CDF Profile models the **token surface**, not the component library's
API. The vocabulary that covers this property SHOULD use the
**token-key values**, not the semantic API values:

```yaml
# CORRECT — vocabulary mirrors the DTCG token keys
vocabularies:
  label_scheme:
    values: [blue, green, yellow, orange, red, purple, pink, gray]
    description: |
      Label background/foreground colour family. Names match the
      Primer token tree (label.{scheme}.bgColor, label.{scheme}.fgColor).
      A consuming component library MAY expose a semantic wrapper
      (e.g. variant=accent ↦ scheme=blue); that mapping is a
      library-level concern, not a Profile concern.
```

```yaml
# AVOID — vocabulary embeds semantic API names that don't appear in tokens
vocabularies:
  label_scheme:
    values: [accent, success, attention, severe, danger, done, sponsors]
    # ⚠ These names do NOT appear in the token tree. The Profile would
    #   need a private mapping table to bridge them — Profile becomes
    #   a layer of business logic, not a description of the DS surface.
```

**Why the separation:**

- The Profile's vocabularies must align with what the token tree
  actually exposes. A vocabulary value MUST be addressable in the
  token grammar (otherwise placeholder substitution `label.{scheme}`
  breaks).
- The semantic wrapper — if a CDF-consuming code generator emits one
  for ergonomic API surface — belongs at the **component-library
  generation step**, parametrised by a separate semantic-mapping
  declaration outside the Profile.
- This separation keeps the Profile honest (it describes only the
  token surface) and keeps the library wrapper composable (it can
  vary independently of the underlying tokens).

> **Multi-DS observation.** Most DSes do not have this split: shadcn's
> variant values match its token names (`primary` → `--primary`),
> Formtrieb's hierarchy names appear in both tokens and Components.
> Primer is the first DS in the foreign-DS validation series where
> consumer-facing API and token-key surface diverge — but the pattern
> generalises: any time a designer-or-developer sees a property name
> that doesn't match the token they expect, the answer is "the
> semantic wrapper lives at the library layer; the token-key
> vocabulary lives in the Profile."

---

