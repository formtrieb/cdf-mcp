import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveCdfSpecsDir } from "../src/resolve-specs-dir.js";

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "cdf-mcp-resolve-specs-"));
}

function writeFragment(specsDir: string): void {
  mkdirSync(join(specsDir, "profile"), { recursive: true });
  writeFileSync(join(specsDir, "profile", "index.md"), "# index\n", "utf8");
}

describe("resolveCdfSpecsDir", () => {
  it("(1) honours CDF_SPECS_DIR env var verbatim — no walk-up, no bundled lookup", () => {
    const tempStart = makeTempRoot();
    const tempEnv = makeTempRoot();
    const tempSelf = makeTempRoot();
    // Both walk-up + bundled paths would resolve to nothing in these
    // dirs anyway, but the assertion is that env wins regardless.
    const out = resolveCdfSpecsDir({
      startDir: tempStart,
      envSpecsDir: tempEnv,
      selfDir: tempSelf,
    });
    expect(out).toBe(resolve(tempEnv));
  });

  it("(2) walks up from startDir to find monorepo cdf/specs/profile/index.md", () => {
    const root = makeTempRoot();
    const specsDir = join(root, "cdf", "specs");
    writeFragment(specsDir);
    const deep = join(root, "packages", "cdf-mcp", "config-host");
    mkdirSync(deep, { recursive: true });
    const out = resolveCdfSpecsDir({ startDir: deep });
    expect(out).toBe(specsDir);
  });

  it("(3) falls back to <selfDir>/spec-fragments when monorepo walk-up finds nothing", () => {
    // startDir is in tmpdir (no parent has cdf/specs/profile/index.md
    // since /tmp itself never contains one in our test fixtures).
    const startDir = makeTempRoot();
    const selfDir = makeTempRoot();
    const bundled = join(selfDir, "spec-fragments");
    writeFragment(bundled);
    const out = resolveCdfSpecsDir({ startDir, selfDir });
    expect(out).toBe(bundled);
  });

  it("(3) bundled fallback is ignored when selfDir is omitted", () => {
    const startDir = makeTempRoot();
    const out = resolveCdfSpecsDir({ startDir });
    // Should land on the last-resort fallback ${startDir}/cdf/specs.
    expect(out).toBe(resolve(join(startDir, "cdf/specs")));
  });

  it("(4) returns last-resort <startDir>/cdf/specs when nothing matches — keeps error path legible", () => {
    const startDir = makeTempRoot();
    const selfDir = makeTempRoot(); // empty — no spec-fragments
    const out = resolveCdfSpecsDir({ startDir, selfDir });
    expect(out).toBe(resolve(join(startDir, "cdf/specs")));
  });

  it("env var wins over walk-up even when both could resolve", () => {
    const root = makeTempRoot();
    const monorepoSpecs = join(root, "cdf", "specs");
    writeFragment(monorepoSpecs);
    const explicit = makeTempRoot();
    const out = resolveCdfSpecsDir({
      startDir: join(root, "packages", "cdf-mcp"),
      envSpecsDir: explicit,
    });
    expect(out).toBe(resolve(explicit));
  });

  it("walk-up wins over bundled when both could resolve", () => {
    const root = makeTempRoot();
    const monorepoSpecs = join(root, "cdf", "specs");
    writeFragment(monorepoSpecs);
    const selfDir = makeTempRoot();
    const bundled = join(selfDir, "spec-fragments");
    writeFragment(bundled);
    const out = resolveCdfSpecsDir({
      startDir: join(root, "packages", "cdf-mcp"),
      selfDir,
    });
    expect(out).toBe(monorepoSpecs);
  });
});
