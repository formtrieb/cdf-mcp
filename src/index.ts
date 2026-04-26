import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseConfigFile, TokenTree } from "@formtrieb/cdf-core";
import type { CDFConfig } from "@formtrieb/cdf-core";
import { resolveCdfSpecsDir } from "./resolve-specs-dir.js";
import { TokenLoader } from "./loader/token-loader.js";
import { registerValidateComponentTool } from "./tools/validate-component.js";
import { registerValidateProfileTool } from "./tools/validate-profile.js";
import { registerListTools } from "./tools/list.js";
import { registerListProfilesTool } from "./tools/list-profiles.js";
import { registerGetProfileSectionTool } from "./tools/get-profile-section.js";
import { registerGetSpecFragmentTool } from "./tools/get-spec-fragment.js";
import { registerResolveExtendsTool } from "./tools/resolve-extends.js";
import { registerCoverageProfileTool } from "./tools/coverage-profile.js";
import { registerDiffProfileTool } from "./tools/diff-profile.js";
import { registerGetTools } from "./tools/get.js";
import { registerResolveTools } from "./tools/resolve.js";
import { registerCheckTokensTools } from "./tools/check-tokens.js";
import { registerDiffTools } from "./tools/diff.js";
import { registerCoverageTools } from "./tools/coverage.js";
import { registerSuggestTools } from "./tools/suggest.js";
import { registerScaffoldTools } from "./tools/scaffold.js";
import { registerVocabDivergeTools } from "./tools/vocab-diverge.js";
// v1.7.0 — Figma Access Modernization (N1+N5)
import { registerFetchFigmaFileTool } from "./tools/fetch-figma-file.js";
import { registerResolveFigmaVariablesTool } from "./tools/resolve-figma-variables.js";
import { registerExtractFigmaFileTool } from "./tools/extract-figma-file.js";
import { registerRenderFindingsTool } from "./tools/render-findings.js";
import { registerRenderSnapshotTool } from "./tools/render-snapshot.js";

// Load CDF config
const configPath = resolve(
  process.env.CDF_CONFIG ?? ".cdf.config.yaml"
);

let config: CDFConfig | undefined;
if (existsSync(configPath)) {
  config = parseConfigFile(configPath);
}

// Resolve paths relative to the config file's directory when a config was
// loaded; otherwise fall back to cwd. Claude Desktop launches MCP servers
// with cwd=`/`, so relying on cwd makes relative paths in the config
// (`./specs`, `./tokens`) resolve to filesystem root — which is never right.
const configDir = config ? dirname(configPath) : process.cwd();

const specDirectories = (config?.spec_directories ?? ["./specs/components"]).map(
  (d) => resolve(configDir, d)
);

// CDF spec root — holds the Profile-Spec fragments under cdf/specs/profile/.
// See `resolve-specs-dir.ts` for the full resolution order (env var →
// monorepo walk-up → bundled fallback → legible-error path).
const cdfSpecsDir = resolveCdfSpecsDir({
  startDir: configDir,
  envSpecsDir: process.env.CDF_SPECS_DIR,
  selfDir: dirname(fileURLToPath(import.meta.url)),
});

// Load token tree (optional — needed for check-tokens and coverage).
// Tokens are optional per CDF-PROFILE-SPEC; configs with token_sources:[]
// or no tokens entry at all must boot without error.
let tokenTree: TokenTree | undefined;
const tokenSources = config?.token_sources ?? ["./tokens"];
const firstTokenSource = tokenSources[0];
if (firstTokenSource) {
  const tokenPath = resolve(configDir, firstTokenSource);
  if (existsSync(tokenPath)) {
    const tokenLoader = new TokenLoader(tokenPath);
    tokenLoader.load();
    tokenTree = new TokenTree(
      tokenLoader.getAllSets(),
      tokenLoader.getTokenSetOrder()
    );
  }
}

// Cache root for the v1.7.0 Figma-access tools. Convention: <configDir>/.cdf-cache/.
// Survives MCP restart, sharable cross-session, manually flushable by deleting the
// directory. See docs/plans/active/2026-04-26-figma-access-modernization.md §3.
const cacheRoot = resolve(configDir, ".cdf-cache");

// Create MCP server
const server = new McpServer({
  name: "formtrieb-cdf",
  version: "1.7.0",
});

// Register all tools
registerValidateComponentTool(server, specDirectories, config);
registerValidateProfileTool(server);
registerListTools(server, specDirectories);
registerListProfilesTool(server, specDirectories);
// v1.6.0 — Profile-Read + Diff + Coverage surface
registerGetProfileSectionTool(server, specDirectories);
// v1.6.1 — CDF-PROFILE-SPEC fragment reader
registerGetSpecFragmentTool(server, cdfSpecsDir);
registerResolveExtendsTool(server, specDirectories);
registerCoverageProfileTool(server, specDirectories);
registerDiffProfileTool(server, specDirectories);
registerGetTools(server, specDirectories, config);
registerResolveTools(server, specDirectories);
registerCheckTokensTools(server, specDirectories, config, tokenTree);
registerDiffTools(server, specDirectories);
registerCoverageTools(server, specDirectories, tokenTree);
registerSuggestTools(server, specDirectories, config);
registerScaffoldTools(server);
registerVocabDivergeTools(server, specDirectories, config, configPath);
// v1.7.0 — Figma Access Modernization (N1.4 / N5)
registerFetchFigmaFileTool(server, cacheRoot);
registerResolveFigmaVariablesTool(server, cacheRoot);
registerExtractFigmaFileTool(server, cacheRoot);
registerRenderFindingsTool(server);
registerRenderSnapshotTool(server);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
