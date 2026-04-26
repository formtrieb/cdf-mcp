## 4. Identity

The Identity block declares **what this Profile is** and **what it is
compatible with**. It is the first thing a consumer reads.

```yaml
name: string                      # REQUIRED
version: string                   # REQUIRED — semver
cdf_version: string               # REQUIRED — semver range
dtcg_version: string              # optional — date-based DTCG version
extends: path                     # optional — another .profile.yaml
description: string               # REQUIRED — multi-line
```

### 4.1 `name`

- **Type:** string
- **REQUIRED.**
- **Rule:** PascalCase. Used as a human-facing identifier and (conventionally)
  as the prefix derivation source (e.g. `name: Formtrieb` → `css_prefix: ft`,
  declared explicitly in [§9](#9-naming)).
- **Stability:** MUST NOT change across minor/patch versions. A rename is a
  major version bump, because downstream CDF Components may refer to the Profile
  by name.

### 4.2 `version`

- **Type:** semver string (e.g. `"1.0.0"`, `"1.1.0-draft"`).
- **REQUIRED.**
- **Rule:** Follows [semver 2.0](https://semver.org). Breaking changes to
  `vocabularies`, `token_grammar`, or `naming` require a major version bump.
  Additions that do not invalidate existing CDF Components require a minor bump.
  Documentation-only changes are a patch.
- **Pre-release:** A `-draft` suffix signals the Profile is experimental and
  consumers MUST NOT assume stability.

### 4.3 `cdf_version`

- **Type:** semver range (e.g. `">=1.0.0 <2.0.0"`, `">=1.0.0-draft"`).
- **REQUIRED.**
- **Purpose:** Declares which CDF Component versions this Profile is compatible with.
  A validator MUST refuse to resolve a CDF Component against a Profile whose
  `cdf_version` range does not include the CDF Component Component's own version.
- **Rule:** Ranges SHOULD be expressed as closed-open intervals per semver
  convention.

### 4.4 `dtcg_version`

- **Type:** date string matching the DTCG release versioning (e.g.
  `"2025.10"`).
- **Optional.**
- **Purpose:** Declares which DTCG version the Profile's `token_grammar`
  types against. A Profile that does not import DTCG tokens MAY omit this.
- **Default:** If omitted, consumers assume the latest DTCG release.

### 4.5 `extends`

- **Type:** path string, relative to the Profile file's location.
- **Optional.**
- **Purpose:** Declares Profile inheritance (see [§15](#15-profile-extension)).
  An extended Profile's fields are inherited; the extending Profile overrides
  selectively.
- **Rule:** Circular extension MUST be rejected by a validator.

### 4.6 `description`

- **Type:** string (multi-line allowed).
- **REQUIRED.**
- **Purpose:** Explains the intent of the Profile in prose. Read by humans
  and LLMs; SHOULD answer "what system is this, and what does it cover?" in
  under 120 words.

### 4.7 Example

```yaml
name: Formtrieb
version: "1.0.0"
cdf_version: ">=1.0.0 <2.0.0"
dtcg_version: "2025.10"
description: >
  Formtrieb design system profile. Defines the semantic vocabulary for
  interactive controls and status indicators across all targets.
```

---

