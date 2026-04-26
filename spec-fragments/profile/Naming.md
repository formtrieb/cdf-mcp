## 9. Naming

A Profile declares the DS's **abstract identity** and the **casing conventions**
that every Target MUST respect. Concrete expressions — CSS class prefixes, BEM
patterns, Swift type prefixes — live in the relevant Target; Targets derive
them from the Profile's identifier via a small template DSL (see
[CDF Target §5.6](CDF-TARGET-SPEC.md#56-identifier-template-dsl)).

**What lives here (DS identity, invariant across frameworks):**
- the abstract identifier (`identifier:`)
- casing of DS-level identifiers (component names, property keys, token paths)
- reserved DS-level names

**What lives in the Target (framework expression):**
- CSS class and custom-property prefixes, BEM methodology, BEM pattern,
  CSS-selector casing (Target §9 Styling)
- Type prefixes for typed languages (Target §8 API)
- File-name casing (Target §6 Output)

### 9.1 Schema

```yaml
naming:
  identifier: string              # REQUIRED — abstract DS identifier, lowercase-kebab
                                  # e.g. "ft" (Formtrieb), "acme" (a consuming DS)
                                  # Targets derive concrete prefixes via the identifier
                                  # template DSL (Target §5.6).
  casing:                         # REQUIRED
    component_names: string       # Identifier casing for components
    properties: string            # Identifier casing for Component property keys
    token_paths: string           # Casing of segments in token paths
  reserved_names:                 # optional — key → rationale
    {name}: string
```

### 9.2 `identifier`

A short, lowercase, hyphen-safe string identifying the DS. This is the
**atom** from which every Target derives its framework-specific prefixes.

| Profile   | `identifier` | Typical Web CSS class | Typical Swift type |
| --------- | ------------ | --------------------- | ------------------ |
| Formtrieb | `ft`         | `.ft-button`          | `FTButton`         |
| Acme      | `acme`       | `.acme-button`        | `AcmeButton`       |

Rules:

1. **Lowercase, a–z and hyphens only.** Underscore, digits, and Unicode are
   reserved for future use; validators MUST reject identifiers that do not
   match `^[a-z][a-z-]*$`.
2. **Short.** Conventionally 2–4 characters. Longer identifiers produce
   awkward CSS class names.
3. **Immutable after first publication.** An identifier rename is a major
   version bump — it breaks every generated artefact downstream.

The identifier is case-*preserving* in this spec. Targets apply casing
transforms via the Identifier Template DSL; the Profile does not normalise
casing on the identifier itself.

### 9.3 `casing`

Casing declarations are **normative**: Targets MUST cast identifiers to
the declared casing when emitting DS-level names.

| Key                | Applies to                                      | Typical value  |
| ------------------ | ----------------------------------------------- | -------------- |
| `component_names`  | `CDFComponent.name`, emitted class identifiers  | `PascalCase`   |
| `properties`       | Component property keys, emitted framework props | `camelCase`    |
| `token_paths`      | Segments in a DTCG token path                   | `camelCase`    |

Recognised casing names: `kebab-case`, `camelCase`, `PascalCase`,
`snake_case`, `lowercase`, `UPPERCASE`.

> **Target-specific casing lives in the Target.** `css_selectors` casing
> (kebab for Web) and `file_names` casing (kebab for Web, PascalCase for
> Swift-source files) are framework idioms; they belong in the relevant
> Target's Styling or Output section, not here.

### 9.4 `reserved_names`

A dictionary of names the DS **reserves** — disallowed as Component property
names, state axis names, or anatomy part names without explicit opt-in.
Each entry declares the rationale so LLMs and humans understand why.

```yaml
reserved_names:
  interaction: "Axis name for interaction states (not 'state')"
  hierarchy:   "Axis name for visual emphasis (not 'type')"
  type:        "Reserved for semantically distinct presentation modes"
```

A validator MUST reject a CDF Component that uses a reserved name for a
different purpose than its rationale implies. Whether this is an error or
a warning is up to the validator configuration.

> **Note on framework-level reserved names.** This list is DS-level.
> Framework-specific reserved names (Angular `input`/`output`/`signal`;
> Swift keywords; HTML attribute collisions like `readonly`) live in the
> [Target](CDF-TARGET-SPEC.md#12-normalization), not here — a Profile is
> framework-agnostic.

### 9.5 Example

```yaml
naming:
  identifier: "ft"
  casing:
    component_names: PascalCase
    properties: camelCase
    token_paths: camelCase
  reserved_names:
    interaction: "Axis name for interaction states (not 'state')"
    hierarchy:   "Axis name for visual emphasis (not 'type')"
```

A Web Target consuming this Profile derives `css_prefix = "ft-"`,
`token_prefix = "--ft-"`, and emits `.ft-button--brand` for a Button.
A Swift Target derives `type_prefix = "FT"` and emits `FTButton`. Both
trace back to the single `identifier: "ft"` declaration.

### 9.6 Migration from v0.x

The Profile `naming:` block in v0.x carried `css_prefix`, `token_prefix`,
`methodology`, `pattern`, `casing.css_selectors`, and `casing.file_names`.
These are relocated in v1.0.0-draft:

| v0.x `naming.` field        | v1.0.0 location                          |
| --------------------------- | ---------------------------------------- |
| `css_prefix`                | Target §9 `styling.css_prefix`           |
| `token_prefix`              | Target §9 `styling.token_prefix`         |
| `methodology`               | Target §9 `styling.methodology`          |
| `pattern`                   | Target §9 `styling.pattern`              |
| `casing.css_selectors`      | Target §9 `styling.casing.css_selectors` |
| `casing.file_names`         | Target §6 `output.files` (per-artefact)  |

A v0.x Profile that ships an explicit `css_prefix: "ft-"` migrates to v1.0.0
by setting `identifier: "ft"` in the Profile and letting the Target derive
`css_prefix: "{identifier}-"` (the default). Profiles that used non-derivable
custom prefixes (e.g. `css_prefix: "formtrieb-"` while identifier would be
`ft`) can override explicitly in the Target.

---

