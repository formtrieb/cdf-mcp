## 15. Profile extension

A Profile MAY extend another Profile via the `extends:` field ([§4.5](#45-extends)).
Extension is the mechanism by which multiple DSes share one vocabulary:
a consuming Profile extends a parent (e.g. Formtrieb), inheriting the full
token grammar, vocabularies, interaction patterns, and accessibility
defaults while overriding only the parts that differ (naming prefix,
theming contexts, categories, assets).

### 15.1 Rules at a glance

| Field group                 | Merge semantics                                        |
| --------------------------- | ------------------------------------------------------ |
| `name`, `version`           | Always the extending Profile's own values              |
| `cdf_version`               | Extending Profile declares its own; MUST be within parent's range |
| `extends`                   | Single-level only — chains are not supported in v1.0.0-draft |
| `description`               | Replaces parent                                        |
| `vocabularies`              | Per-key: new keys added, existing keys REPLACE parent (entire vocabulary entry, not value list) |
| `token_grammar`             | Per-key: new keys added, existing keys REPLACE         |
| `token_layers`              | Additive only — new layers added, existing layers MAY extend `grammars:`/`references:` but MUST NOT remove entries. Layer ordering is preserved from the parent; new layers append. (see §6.10.6) |
| `standalone_tokens`         | Additive only — new tokens added, existing tokens MAY extend `values:` but MUST NOT remove tokens, values, or change `dtcg_type`. (see §6.11.5) |
| `token_sources`             | REPLACE entire block (see §7.6)                        |
| `theming.modifiers`         | Per-modifier: new added, existing REPLACE              |
| `theming.set_mapping`       | REPLACE entire block                                   |
| `naming`                    | Per-key replace (e.g. extending Profile MAY override `css_prefix` while inheriting the rest) |
| `interaction_patterns`      | Per-pattern: new added, existing REPLACE               |
| `accessibility_defaults`    | Per-block: new added, existing blocks REPLACE          |
| `categories`                | Per-category: new added, existing REPLACE (see [§12.5](#125-extension-semantics)) |
| `assets`                    | Per-asset-type REPLACE (e.g. `assets.icons` replaces entirely) |

**Default principle:** replace at the smallest documented unit, never at
value-list granularity. An extending Profile CANNOT remove individual
values from an inherited vocabulary — doing so silently would invalidate
CDFs across the DS family.

### 15.2 Value additions to inherited vocabularies

An extending Profile MAY add values to an inherited vocabulary by naming
the vocabulary explicitly and providing the **full** replacement list
including the inherited values. There is no partial-add syntax — the
replacement is always whole-list, to keep the file self-contained and
readable.

```yaml
# parent (Formtrieb): vocabularies.hierarchy.values = [brand, primary, secondary, tertiary]
# extending (Big Co):
vocabularies:
  hierarchy:
    description: "..."                          # MUST carry forward or restate
    values: [brand, primary, secondary, tertiary, muted]   # +muted
```

A validator MAY warn if an extending Profile's replacement list drops
parent values (potential mistake) or reorders them (breaks order-sensitive
consumers).

### 15.3 Circular extension

`extends:` chains MUST NOT form cycles. A validator MUST reject a Profile
whose `extends:` eventually references itself (direct or transitive).

### 15.4 Compatibility with parent's `cdf_version`

The extending Profile's `cdf_version:` range MUST be within the parent's
`cdf_version:` range. Extending a Profile that supports CDF Component 1.x
while declaring support for CDF Component 2.x is rejected: the parent's
rules may not hold
for the wider range.

### 15.5 Example — Acme extends Formtrieb

```yaml
# Extending only what differs.
name: Acme
version: "1.0.0"
extends: ../formtrieb.profile.yaml
cdf_version: ">=1.0.0 <2.0.0"
description: >
  Acme extends Formtrieb with Acme-specific naming, theming,
  and component categories.

# Naming override — same casing, different identifier.
naming:
  identifier: "acme"
  # casing inherited unchanged from Formtrieb

# Theming contexts differ from Formtrieb's.
theming:
  modifiers:
    semantic:
      description: "Light/Dark color scheme — Acme-specific themes."
      contexts: [Light, Dark]     # No brand-specific themes
      default: Light
      required: true
      data_attribute: data-semantic
  set_mapping:                    # REPLACE whole — §8.3 requires coverage
    "Foundation/Foundation":  { always_enabled: true }
    "Semantic/Light":         { modifier: semantic, context: Light }
    "Semantic/Dark":          { modifier: semantic, context: Dark }
    # … rest of Acme's set mapping …

# Concrete assets — parent has only the template.
assets:
  icons:
    naming_case: snake
    sizes: [xsmall, small, base, large]
    origin:      { type: figma, url: "...", export_tool: build-icons }
    consumption: { type: typescript-registry, registry_path: "./icon-registry",
                   registry_export: icons, name_type_export: IconName,
                   viewbox: "0 0 20 20" }

# vocabularies, token_grammar, interaction_patterns, accessibility_defaults,
# categories — all inherited from Formtrieb without change.
```

### 15.6 Known limitation — single-level extension

v1.0.0-draft supports **one level** of extension (profile B extends
profile A). Multi-level chains (C extends B extends A) are rejected. This
constraint simplifies merge semantics and makes validator implementations
straightforward; it will be revisited when a real use case demands chains.

> **Implementation workaround.** The current `formtrieb-cdf-core` parser
> relies on a workaround (always loading `formtrieb.profile.yaml` and
> mutating the prefix) because true extension resolution is not yet
> implemented. A future minor version formalises this.

---

