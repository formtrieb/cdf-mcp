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
});
