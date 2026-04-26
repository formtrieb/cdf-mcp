import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  // No .d.ts generation — this is an executable MCP server, not a library.
  // Run `pnpm build:typecheck` separately for type validation.
  dts: false,
  // Shebang for npx invocation — tsup prepends the banner ahead of the
  // ESM bundle. Without it, npx errors with "could not determine
  // executable to run" because the bin file isn't directly executable.
  banner: {
    js: "#!/usr/bin/env node",
  },
});
