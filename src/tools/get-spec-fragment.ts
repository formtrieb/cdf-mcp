import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const FRAGMENTS = [
  "index",
  "Identity",
  "Vocabularies",
  "TokenGrammar",
  "TokenLayers",
  "StandaloneTokens",
  "Resolution",
  "TokenSources",
  "Theming",
  "Naming",
  "InteractionPatterns",
  "AccessibilityDefaults",
  "Categories",
  "Assets",
  "Extends",
] as const;

type Fragment = (typeof FRAGMENTS)[number];

interface ParsedSection {
  heading: string;
  level: number;
  body: string;
}

// Splits markdown on h2+h3 headings into a flat section list. The first
// chunk (before any heading) is emitted with heading="" and level=0 so
// callers don't lose preamble content.
function parseSections(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { heading: "", level: 0, body: "" };
  for (const line of lines) {
    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (match) {
      if (current.heading || current.body.length > 0) {
        current.body = current.body.replace(/\n+$/, "");
        sections.push(current);
      }
      current = { heading: match[2], level: match[1].length, body: "" };
    } else {
      current.body += line + "\n";
    }
  }
  current.body = current.body.replace(/\n+$/, "");
  if (current.heading || current.body.length > 0) sections.push(current);
  return sections;
}

export function registerGetSpecFragmentTool(
  server: McpServer,
  cdfSpecsDir: string,
) {
  server.registerTool(
    "cdf_get_spec_fragment",
    {
      description:
        "Read a CDF-PROFILE-SPEC fragment from cdf/specs/profile/. Fragments " +
        "are the canonical authoring source; the monolith CDF-PROFILE-SPEC.md " +
        "is a generated publication artefact. Use format='sections' to get a " +
        "parsed heading map for targeted subsection lookup.",
      inputSchema: {
        fragment: z
          .enum(FRAGMENTS)
          .describe("Fragment name (top-level concept, e.g. 'Vocabularies')."),
        format: z
          .enum(["markdown", "sections"])
          .optional()
          .describe("'markdown' (default) returns raw content; 'sections' returns a parsed heading map."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ fragment, format }: { fragment: Fragment; format?: "markdown" | "sections" }) => {
      const path = join(cdfSpecsDir, "profile", `${fragment}.md`);
      if (!existsSync(path)) {
        throw new Error(
          `Spec fragment '${fragment}' not found at ${path}. ` +
            `Expected cdf/specs/profile/${fragment}.md under the CDF specs root.`,
        );
      }
      const content = readFileSync(path, "utf8");
      if (format === "sections") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ fragment, sections: parseSections(content) }, null, 2),
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: content }] };
    },
  );
}
