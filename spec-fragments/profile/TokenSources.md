## 7. Token sources

A Profile that owns tokens declares **where its DTCG JSON files live** and
**how those files compose into token sets**. Consumers (Tokens MCP, resolver,
generator) read this to locate the JSON and to understand which sets are
always active vs. switched by theme modifiers (see [§8](#8-theming)).

A Profile MAY omit `token_sources:` if it does not ship its own tokens —
e.g. an abstract Profile that defines vocabulary only, extended by concrete
Profiles that supply the tokens.

### 7.1 Schema

```yaml
token_sources:
  directory: path                 # REQUIRED — root directory, relative
                                  #            to the profile file
  format: string                  # optional — "tokens-studio" (default) |
                                  #            "dtcg-native"
  sets:                           # REQUIRED — grouped set references
    {group}:                      # e.g. foundation, semantic, device, …
      - path                      # — path under `directory`, without .json
      - path
```

### 7.2 `directory`

Path relative to the `.profile.yaml` file. Points at the root under which
all referenced set files live. Consumers resolve set references as
`{directory}/{set_path}.json`.

### 7.3 `format`

Declares the JSON dialect. Currently recognised:

- `tokens-studio` (default) — Tokens Studio export format:
  `$value`/`$type`/`$description`, optional `$themes.json` and
  `$metadata.json` at the root.
- `dtcg-native` — [DTCG specification](https://design-tokens.github.io/)
  straight JSON.

Profiles SHOULD NOT mix formats within one `directory`.

### 7.4 `sets`

A dictionary of named groups, each listing the set files (paths without
`.json`) that belong to that group. Group names are informational —
consumers MAY surface them (MCP token browsing, docs) but MUST NOT infer
theming semantics from them. Theming semantics live in
[§8.3 `set_mapping`](#83-set_mapping).

### 7.5 Example

```yaml
token_sources:
  directory: ./tokens
  sets:
    foundation:
      - Foundation/Foundation
      - Foundation/HelpersFoundation
    semantic:
      - Semantic/Light
      - Semantic/Dark
    device:
      - Device/Desktop
      - Device/Tablet
      - Device/Mobile
    components:
      - Components/Icon
      - Components/InputGroup
```

### 7.6 Extension semantics

If this Profile extends another via [§15](#15-profile-extension) and both
declare `token_sources:`, the extending Profile's declaration **replaces**
the parent's in full. Partial merging of token-source trees is not
supported — composition of tokens across Profiles happens in DTCG, not at
the Profile level.

---

