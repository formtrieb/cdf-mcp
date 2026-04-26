### 6.11 `standalone_tokens` — tokens outside any grammar

Not every token fits a grammar pattern. A DS typically has a handful of
tokens that are **singletons** (`color.page`, `color.backdrop`) or
small flat enumerations (`color.brand.{primary|secondary}`). These
tokens are registered in `standalone_tokens:` so that:

- LLMs and humans know they exist without having to grep the DTCG files.
- Validators can type-check their usage in CDFs (via `dtcg_type`).
- The Profile's token space (grammar-covered + standalone) is closed:
  any other path in the DTCG files that is neither is a mistake.

#### 6.11.1 Schema

```yaml
standalone_tokens:
  {token-path}:                 # full dotted path, e.g. color.page
    dtcg_type: string           # REQUIRED — DTCG $type
    description: string         # REQUIRED — what the token represents
    values: [string]            # optional — legal leaf names when the
                                # path expands to an enumeration
    layer: string               # optional — the token_layers layer
                                # this token belongs to (§6.10)
```

#### 6.11.2 Rules

1. **`{token-path}` MUST NOT match any declared grammar pattern.** A
   token path is either grammar-covered (§6) OR standalone — never both.
2. **`dtcg_type` MUST be one of the declared DTCG types.** See `dtcg_version:`
   in Profile §4 for the supported set.
3. **`values:` is a flat enumeration of leaf names.** When present, the
   effective token paths are `{token-path}.{value}` for each entry.
   Paths not in the enumeration are not part of the DS.
4. **`layer:` is optional.** When present, MUST match a name in
   `token_layers:` (§6.10) and behaves the same as a grammar listed
   under that layer — the standalone token participates in the cascade.

#### 6.11.3 Example (Formtrieb)

```yaml
standalone_tokens:
  color.page:
    dtcg_type: color
    description: "Page background. Light = white, Dark = near-black."
    layer: Components

  color.backdrop:
    dtcg_type: color
    description: "Overlay backdrop. Typically black with scrim opacity."
    layer: Components

  color.brand:
    dtcg_type: color
    description: "Brand accent colors for non-control usage."
    values: [primary, secondary]
    layer: Components

  color.light:
    dtcg_type: color
    description: "Constant light color (white) — for inverted text/icons."
    layer: Foundation

  color.dark:
    dtcg_type: color
    description: "Constant dark color (black)."
    layer: Foundation
```

Effective token paths: `color.page`, `color.backdrop`, `color.brand.primary`,
`color.brand.secondary`, `color.light`, `color.dark`.

#### 6.11.4 Relationship to grammar-covered tokens

The two are complementary. A Profile's token space is:

> **Total token space** = all paths matched by any `token_grammar:` pattern
>                       ∪ all paths named in `standalone_tokens:`

A DTCG token file containing a path in neither set is a validation warning
("unexpected token path not declared in Profile").

**Choosing between grammar and standalone.** Both mechanisms can declare
the same kind of tokens — the choice is authorial:

- **Use `token_grammar`** when a family varies along one or more named
  axes whose values are enumerable: `radius.{size}`, `dimension.{scale}`,
  `borderWidth.{name}`, `fontSizes.{variant}.{size}`. The grammar makes
  the axes first-class: validators can enumerate legal paths, derive
  `{placeholder}` resolution rules, and surface missing values. Foundation
  families (dimension scales, radius scales, typography primitives) are
  almost always grammars.
- **Use `standalone_tokens`** for singletons (`color.page`, `color.backdrop`),
  small flat enumerations with no shared axis (`color.brand: [primary,
  secondary]`), or tokens that are intrinsically one-off. If you find
  yourself declaring many `standalone_tokens` entries that share a dotted
  prefix, the cue is to promote them to a grammar.

A practical rule of thumb: if a path has `{placeholder}`-style variation
a CDF Component might want to address through a property or state, it
belongs in `token_grammar`. If a path is used verbatim as a fixed value,
`standalone_tokens` is enough.

#### 6.11.5 Extension semantics

A Profile extending another (§15) MAY add new standalone tokens or
add `values:` to existing enumerations. It MAY NOT remove standalone
tokens, remove enumeration values, or change a token's `dtcg_type`.
Changes to `description:` are free (documentation-only).

---

