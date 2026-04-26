import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Resolves the directory that holds the CDF Profile-Spec fragments
 * (`<root>/profile/<Fragment>.md`).
 *
 * Resolution order — first match wins:
 *
 *   1. `envSpecsDir` (CDF_SPECS_DIR env var) — explicit override
 *   2. Walk up from `startDir` looking for `cdf/specs/profile/index.md`
 *      — covers the monorepo case where the config lives in a DS
 *      sub-directory alongside the CDF specs
 *   3. `<selfDir>/spec-fragments/profile/index.md` — covers the
 *      npm-installed case where the build step copies the fragments
 *      into the package's own `dist/spec-fragments/`
 *   4. `<startDir>/cdf/specs` — last-resort fallback that keeps the
 *      "fragment not found" error path legible
 *
 * Pure: no side effects beyond filesystem `existsSync` lookups; takes
 * `selfDir` and `envSpecsDir` as inputs so callers can simulate every
 * branch without monkey-patching `import.meta.url` or `process.env`.
 */
export function resolveCdfSpecsDir(opts: {
  startDir: string;
  envSpecsDir?: string | undefined;
  selfDir?: string | undefined;
}): string {
  const { startDir, envSpecsDir, selfDir } = opts;

  if (envSpecsDir) {
    return resolve(envSpecsDir);
  }

  let current = resolve(startDir);
  while (true) {
    const candidate = join(current, "cdf/specs");
    if (existsSync(join(candidate, "profile/index.md"))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (selfDir) {
    const bundled = resolve(selfDir, "spec-fragments");
    if (existsSync(join(bundled, "profile/index.md"))) {
      return bundled;
    }
  }

  return resolve(join(startDir, "cdf/specs"));
}
