import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, resolve as resolvePathFn } from "node:path";
import { parseCDFFile, findProfileFiles } from "@formtrieb/cdf-core";
import type { CDFComponent } from "@formtrieb/cdf-core";

/**
 * Recursively find all .spec.yaml and .component.yaml files in directories.
 */
export function findSpecFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    collectSpecFiles(dir, files);
  }
  return files;
}

function collectSpecFiles(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSpecFiles(full, files);
    } else if (entry.endsWith(".spec.yaml") || entry.endsWith(".component.yaml")) {
      files.push(full);
    }
  }
}

/**
 * Resolve a component name (PascalCase) or file path to a spec file path.
 */
export function resolveComponent(nameOrPath: string, specDirectories: string[]): string {
  // If it looks like a file path, return as-is
  if (nameOrPath.includes("/") || nameOrPath.includes("\\") || nameOrPath.endsWith(".yaml")) {
    return nameOrPath;
  }

  // Search by PascalCase name
  const lower = nameOrPath.toLowerCase();
  const allFiles = findSpecFiles(specDirectories);
  const match = allFiles.find((f) => {
    const base = basename(f).replace(/\.(spec|component)\.yaml$/, "").toLowerCase();
    return base === lower || base === kebab(nameOrPath).toLowerCase();
  });

  if (!match) {
    throw new Error(`Component '${nameOrPath}' not found in spec directories: ${specDirectories.join(", ")}`);
  }
  return match;
}

/**
 * Load all CDF components from spec directories.
 */
export function loadAllComponents(specDirectories: string[]): { file: string; component: CDFComponent }[] {
  const files = findSpecFiles(specDirectories);
  return files.map((file) => ({
    file,
    component: parseCDFFile(file),
  }));
}

function kebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Resolve a profile reference to an absolute path.
 * Accepts: (a) absolute or relative file path, (b) profile name (filename minus
 * `.profile.yaml`), matched against files in specDirectories.
 */
export function resolveProfile(
  nameOrPath: string,
  specDirectories: string[],
): string {
  // Case (a): looks like a path and exists
  if (nameOrPath.includes("/") || nameOrPath.endsWith(".yaml")) {
    const abs = resolvePathFn(nameOrPath);
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }

  // Case (b): match against discovered profile files
  const candidates = findProfileFiles(specDirectories);
  const exactName = `${nameOrPath}.profile.yaml`;
  const hit = candidates.find((f) => basename(f) === exactName);
  if (hit) return hit;

  throw new Error(
    `Profile '${nameOrPath}' not found. Searched ${specDirectories.length} directory/ies; ` +
      `expected filename '${exactName}' or a resolvable path.`,
  );
}
