import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { renderSnapshot } from "@formtrieb/cdf-core";
import type { SnapshotProfile, SnapshotFindings } from "@formtrieb/cdf-core";

const PROFILE_SUFFIX = ".snapshot.profile.yaml";
const FINDINGS_SUFFIX = ".snapshot.findings.yaml";

interface RenderResult {
  output_path: string;
  finding_count: number;
  blind_spot_count: number;
}

function findFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => join(dir, entry));
}

function stripSuffix(filename: string, suffix: string): string {
  return filename.endsWith(suffix) ? filename.slice(0, -suffix.length) : filename;
}

function loadYaml<T>(path: string): T {
  return parseYaml(readFileSync(path, "utf8")) as T;
}

export function registerRenderSnapshotTool(server: McpServer) {
  server.registerTool(
    "cdf_render_snapshot",
    {
      description:
        "Render a snapshot DS directory's `<prefix>.snapshot.profile.yaml` + " +
        "`<prefix>.snapshot.findings.yaml` into the four-section markdown briefing " +
        "(BANNER → FINDINGS → BLIND_SPOTS → UPGRADE). " +
        "Hard-fails on schema mismatch (snapshot-profile-v1 + snapshot-findings-v1) " +
        "and on >15 findings (synthesis cap).",
      inputSchema: {
        snapshot_dir: z
          .string()
          .min(1)
          .describe(
            "Directory containing exactly one *.snapshot.profile.yaml and one *.snapshot.findings.yaml.",
          ),
        output_md_path: z
          .string()
          .optional()
          .describe(
            "Override default output path (default: <snapshot_dir>/<prefix>.snapshot.findings.md).",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({
      snapshot_dir,
      output_md_path,
    }: {
      snapshot_dir: string;
      output_md_path?: string;
    }) => {
      if (!existsSync(snapshot_dir) || !statSync(snapshot_dir).isDirectory()) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `snapshot_dir is not a directory: ${snapshot_dir}`,
            },
          ],
        };
      }

      const profileFiles = findFiles(snapshot_dir, PROFILE_SUFFIX);
      const findingsFiles = findFiles(snapshot_dir, FINDINGS_SUFFIX);

      if (profileFiles.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No *.snapshot.profile.yaml found in ${snapshot_dir}.`,
            },
          ],
        };
      }
      if (profileFiles.length > 1) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Expected exactly one *.snapshot.profile.yaml in ${snapshot_dir}; found ${profileFiles.length}.`,
            },
          ],
        };
      }
      if (findingsFiles.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `No *.snapshot.findings.yaml found in ${snapshot_dir}.`,
            },
          ],
        };
      }
      if (findingsFiles.length > 1) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Expected exactly one *.snapshot.findings.yaml in ${snapshot_dir}; found ${findingsFiles.length}.`,
            },
          ],
        };
      }

      const profilePath = profileFiles[0];
      const findingsPath = findingsFiles[0];
      const profilePrefix = stripSuffix(
        profilePath.slice(snapshot_dir.length + 1),
        PROFILE_SUFFIX,
      );
      const findingsPrefix = stripSuffix(
        findingsPath.slice(snapshot_dir.length + 1),
        FINDINGS_SUFFIX,
      );
      if (profilePrefix !== findingsPrefix) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Prefix mismatch: profile='${profilePrefix}' vs findings='${findingsPrefix}'.`,
            },
          ],
        };
      }

      let profile: SnapshotProfile;
      let findings: SnapshotFindings;
      try {
        profile = loadYaml<SnapshotProfile>(profilePath);
        findings = loadYaml<SnapshotFindings>(findingsPath);
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to parse snapshot YAML: ${(err as Error).message}`,
            },
          ],
        };
      }

      let md: string;
      try {
        md = renderSnapshot(profile, findings, { prefix: profilePrefix });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: (err as Error).message }],
        };
      }
      if (!md.endsWith("\n")) md += "\n";

      const outPath = output_md_path ?? join(snapshot_dir, `${profilePrefix}.snapshot.findings.md`);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, md);

      const blindSpots = Array.isArray(profile.blind_spots) ? profile.blind_spots.length : 0;
      const findingCount = Array.isArray(findings.findings) ? findings.findings.length : 0;

      const result: RenderResult = {
        output_path: outPath,
        finding_count: findingCount,
        blind_spot_count: blindSpots,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
