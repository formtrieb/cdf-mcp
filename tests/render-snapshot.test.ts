import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { registerRenderSnapshotTool } from "../src/tools/render-snapshot.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

interface BuildResult {
  invoke: Handler;
  dir: string;
  cleanup: () => void;
}

function buildTool(): BuildResult {
  const dir = mkdtempSync(join(tmpdir(), "cdf-mcp-render-snapshot-"));
  const server = new McpServer({ name: "test", version: "0.0.0" });
  let handler: Handler | undefined;
  const orig = server.registerTool.bind(server);
  // @ts-expect-error patch to capture handler
  server.registerTool = (name: string, def: unknown, fn: Handler) => {
    if (name === "cdf_render_snapshot") handler = fn;
    return orig(name, def as never, fn as never);
  };
  registerRenderSnapshotTool(server);
  if (!handler) throw new Error("cdf_render_snapshot handler not captured");
  return {
    invoke: handler,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const VALID_PROFILE = {
  snapshot_version: "snapshot-profile-v1",
  metadata: {
    ds_name: "primer",
    generated_at: "2026-04-26T00:00:00Z",
    source: { tier: "T1", token_regime: "tokens-mcp" },
  },
  blind_spots: ["No live token resolution surfaced"],
  upgrade_path: "Run cdf-profile-scaffold for the full Production Scaffold.",
};

const VALID_FINDINGS = {
  schema_version: "snapshot-findings-v1",
  ds_name: "primer",
  generated_at: "2026-04-26T00:00:00Z",
  findings: [
    {
      topic: "Mixed token regimes",
      observation: "Some buttons use semantic colors while others use raw hex.",
      evidence_path: ".cdf-cache/phase-1-output.yaml#L120",
    },
    {
      topic: "Missing focus tokens",
      observation: "No `--focus-ring` token observed in the variable collection.",
      evidence_path: ".cdf-cache/figma/ABC.variables.json",
    },
  ],
};

function seedSnapshot(
  dir: string,
  prefix: string,
  profile: unknown = VALID_PROFILE,
  findings: unknown = VALID_FINDINGS,
): { profilePath: string; findingsPath: string } {
  const profilePath = join(dir, `${prefix}.snapshot.profile.yaml`);
  const findingsPath = join(dir, `${prefix}.snapshot.findings.yaml`);
  writeFileSync(profilePath, stringifyYaml(profile));
  writeFileSync(findingsPath, stringifyYaml(findings));
  return { profilePath, findingsPath };
}

function parseResult(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("cdf_render_snapshot", () => {
  it("renders snapshot from a dir containing profile + findings YAMLs", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer");
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(join(ctx.dir, "primer.snapshot.findings.md"));
      expect(existsSync(parsed.output_path as string)).toBe(true);
      expect(parsed.finding_count).toBe(2);
      expect(parsed.blind_spot_count).toBe(1);
    } finally {
      ctx.cleanup();
    }
  });

  it("respects custom output_md_path", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer");
      const customPath = join(ctx.dir, "out.md");
      const result = await ctx.invoke({
        snapshot_dir: ctx.dir,
        output_md_path: customPath,
      });
      const parsed = parseResult(result);
      expect(parsed.output_path).toBe(customPath);
      expect(existsSync(customPath)).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("hard-fails when profile schema mismatch", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer", { ...VALID_PROFILE, snapshot_version: "v0" });
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/snapshot-profile-v1/);
    } finally {
      ctx.cleanup();
    }
  });

  it("hard-fails when findings schema mismatch", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer", VALID_PROFILE, {
        ...VALID_FINDINGS,
        schema_version: "v0",
      });
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/snapshot-findings-v1/);
    } finally {
      ctx.cleanup();
    }
  });

  it("hard-fails when findings count exceeds 15-cap", async () => {
    const ctx = buildTool();
    try {
      const tooMany = {
        ...VALID_FINDINGS,
        findings: Array.from({ length: 16 }, (_, i) => ({
          topic: `topic ${i}`,
          observation: `obs ${i}`,
          evidence_path: `path/${i}`,
        })),
      };
      seedSnapshot(ctx.dir, "primer", VALID_PROFILE, tooMany);
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/15|cap/);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when snapshot_dir is missing", async () => {
    const ctx = buildTool();
    try {
      const result = await ctx.invoke({
        snapshot_dir: join(ctx.dir, "no-such-dir"),
      });
      expect(result.isError).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when profile YAML missing", async () => {
    const ctx = buildTool();
    try {
      writeFileSync(join(ctx.dir, "primer.snapshot.findings.yaml"), stringifyYaml(VALID_FINDINGS));
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/profile/);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when findings YAML missing", async () => {
    const ctx = buildTool();
    try {
      writeFileSync(join(ctx.dir, "primer.snapshot.profile.yaml"), stringifyYaml(VALID_PROFILE));
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/findings/);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors on prefix mismatch between profile + findings", async () => {
    const ctx = buildTool();
    try {
      writeFileSync(
        join(ctx.dir, "primer.snapshot.profile.yaml"),
        stringifyYaml(VALID_PROFILE),
      );
      writeFileSync(
        join(ctx.dir, "different.snapshot.findings.yaml"),
        stringifyYaml(VALID_FINDINGS),
      );
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prefix|mismatch/i);
    } finally {
      ctx.cleanup();
    }
  });

  it("errors when multiple profile YAMLs found", async () => {
    const ctx = buildTool();
    try {
      writeFileSync(
        join(ctx.dir, "a.snapshot.profile.yaml"),
        stringifyYaml(VALID_PROFILE),
      );
      writeFileSync(
        join(ctx.dir, "b.snapshot.profile.yaml"),
        stringifyYaml(VALID_PROFILE),
      );
      writeFileSync(
        join(ctx.dir, "a.snapshot.findings.yaml"),
        stringifyYaml(VALID_FINDINGS),
      );
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/exactly one/i);
    } finally {
      ctx.cleanup();
    }
  });

  it("counts blind_spots from profile.blind_spots", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer", {
        ...VALID_PROFILE,
        blind_spots: ["a", "b", "c"],
      });
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      const parsed = parseResult(result);
      expect(parsed.blind_spot_count).toBe(3);
    } finally {
      ctx.cleanup();
    }
  });

  it("renders empty findings array cleanly (0 findings, profile only)", async () => {
    const ctx = buildTool();
    try {
      seedSnapshot(ctx.dir, "primer", VALID_PROFILE, {
        ...VALID_FINDINGS,
        findings: [],
      });
      const result = await ctx.invoke({ snapshot_dir: ctx.dir });
      const parsed = parseResult(result);
      expect(parsed.finding_count).toBe(0);
      const md = readFileSync(parsed.output_path as string, "utf8");
      expect(md.length).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
  });
});
