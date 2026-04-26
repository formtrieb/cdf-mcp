## 13. Assets

A Profile declares the **external assets** the DS relies on: where they
originate, how generated code consumes them, and what vocabulary they
expose. Currently `assets.icons` is normative; `assets.fonts` and
`assets.illustrations` are reserved for future versions.

The central design decision: **origin and consumption are independent
dimensions.** Icons may originate in Figma and be consumed as a TypeScript
registry (the Formtrieb pattern), or originate as an npm package and be
consumed via direct imports (the Lucide-Angular pattern). A bridge tool
(declared via `export_tool`) connects the two when they differ.

### 13.1 Schema

```yaml
assets:

  icons:
    naming_case: string           # REQUIRED — "snake" | "kebab" | "camel"
    sizes: [string, ...]          # REQUIRED — ordered list, matches a size
                                  #            vocabulary or inline values

    origin:                       # REQUIRED
      type: string                # "figma" | "package" | "filesystem"
      # — shape-specific fields (see §13.3) —

    consumption:                  # REQUIRED
      type: string                # "typescript-registry" | "package-import"
                                  # | "sprite-href"
      # — shape-specific fields (see §13.4) —
```

### 13.2 `icons.naming_case` and `icons.sizes`

- **`naming_case`** — how icon identifiers are cased across the DS. A
  Target generator MUST use this when emitting type-safe icon names.
  Accepts `snake`, `kebab`, `camel`.
- **`sizes`** — ordered list of size identifiers. A CDF Component Icon spec SHOULD
  expose `size: enum` values that match or form a contiguous subset of
  this list. Order is normative (smallest first by convention).

### 13.3 `origin` — where truth lives

Three shapes:

**Figma origin** — icons are authored as vector shapes inside a Figma
component set. An export tool (Claude skill, plugin, pipeline) pulls them
out.

```yaml
origin:
  type: figma
  url: "https://www.figma.com/design/<fileKey>/<name>?node-id=<n>-<n>"
  export_tool: build-icons        # name of the skill/tool that exports
```

**Package origin** — icons come from an npm package or equivalent; the DS
does not own them, only selects which to expose.

```yaml
origin:
  type: package
  package: lucide
  version: ">=0.577"
```

**Filesystem origin** — icons live as SVG files on disk, authored outside
a design tool.

```yaml
origin:
  type: filesystem
  path: "./icons/svg/"
```

### 13.4 `consumption` — how generated code accesses icons

Three shapes:

**TypeScript registry** — the Target generates (or relies on a pre-generated)
TypeScript file that exports a typed name union and a `Record<name, SVG>`
map.

```yaml
consumption:
  type: typescript-registry
  registry_path: "./icon-registry"   # module path, no extension
  registry_export: icons             # named export (the name → SVG map)
  name_type_export: IconName         # named export (the string literal union)
  viewbox: "0 0 20 20"               # SVG viewBox uniform across the DS
```

**Package import** — the consumer imports a pre-built component per icon.

```yaml
consumption:
  type: package-import
  import_package: lucide-angular
  import_symbol: LucideAngularModule
  render_template: '<lucide-icon [name]="name()" [size]="size()" />'
```

**Sprite href** — icons rendered via `<use>` referencing a sprite file.

```yaml
consumption:
  type: sprite-href
  sprite_path: "./icons/sprite.svg"
  href_prefix: "icon-"              # e.g. <use href="./icons/sprite.svg#icon-close" />
```

### 13.5 Origin × consumption combinations

The two dimensions are orthogonal. Common combinations:

| Origin        | Consumption            | Typical use                             |
| ------------- | ---------------------- | --------------------------------------- |
| `figma`       | `typescript-registry`  | Custom DS, icons exported from Figma    |
| `package`     | `package-import`       | Off-the-shelf icon lib (Lucide, Heroicons) |
| `package`     | `typescript-registry`  | Pre-bundle a package's icons into own registry |
| `filesystem`  | `sprite-href`          | Classic SVG sprite pipeline             |

Combinations where origin and consumption are not the same tool typically
declare `origin.export_tool` — the skill/build-step responsible for
bridging them.

### 13.6 Cross-reference

- Icon Component specs bind `size:` enum values to `assets.icons.sizes`
  (see [Component §7](CDF-COMPONENT-SPEC.md#7-properties)).
- Target generators use `consumption` to decide what imports and rendering
  patterns to emit (see
  [CDF Target §11](CDF-TARGET-SPEC.md#11-dependencies)).

### 13.7 Example (Formtrieb)

```yaml
assets:
  icons:
    naming_case: snake
    sizes: [xsmall, small, base, large]
    origin:
      type: figma
      url: "https://www.figma.com/design/EXAMPLE-FILE-ID/DesignSystem?node-id=138-342"
      export_tool: build-icons
    consumption:
      type: typescript-registry
      registry_path: "./icon-registry"
      registry_export: icons
      name_type_export: IconName
      viewbox: "0 0 20 20"
```

---

