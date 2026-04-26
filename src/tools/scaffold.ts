import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateScaffold } from "@formtrieb/cdf-core";
import type { ScaffoldInput } from "@formtrieb/cdf-core";

const CDF_CATEGORIES = [
  "Primitives",
  "Actions",
  "Inputs",
  "Status",
  "Layout",
] as const;

type CDFCategory = (typeof CDF_CATEGORIES)[number];

// M-10: MCP SDK defaults to a 60s request timeout, which fires while
// the user is still reading the scaffold-confirmation form. 10 minutes
// gives a human enough runway to edit the pre-filled identity fields.
const INTERACTIVE_ELICITATION_TIMEOUT_MSEC = 10 * 60 * 1000;

type JsonParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function parseJsonArg<T>(raw: string, fieldName: string): JsonParseResult<T> {
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch (err) {
    return {
      ok: false,
      message: `Invalid JSON in '${fieldName}': ${(err as Error).message}`,
    };
  }
}

export function registerScaffoldTools(server: McpServer) {
  server.registerTool(
    "cdf_scaffold",
    {
      description:
        "Generate a CDF YAML skeleton from Figma analysis data. Accepts JSON outputs of figma_analyze_component_set, extract-token-map.js, and audit-sub-interactions.js. Returns a draft spec that needs human review. IMPORTANT: Always confirms component_name, category, and description with the user via elicitation — any values passed as arguments are treated as suggestions, not final values.",
      inputSchema: {
        // Required: the data blobs Claude gathers from prior tool calls
        figma_analysis: z
          .string()
          .min(1)
          .describe(
            "JSON output from figma_analyze_component_set (the 'analysis' field)"
          ),
        token_map: z
          .string()
          .optional()
          .describe(
            "JSON output from extract-token-map.js script via figma_execute"
          ),
        interaction_audit: z
          .string()
          .optional()
          .describe(
            "JSON output from audit-sub-interactions.js script via figma_execute"
          ),
        // Optional suggestions — user confirms via elicitation
        component_name: z
          .string()
          .optional()
          .describe(
            "Suggested PascalCase component name (e.g. 'NumericPagination'). User will confirm or edit."
          ),
        category: z
          .enum(CDF_CATEGORIES)
          .optional()
          .describe("Suggested category. User will confirm or edit."),
        description: z
          .string()
          .optional()
          .describe(
            "Suggested one-sentence description. User will confirm or edit."
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({
      figma_analysis,
      token_map,
      interaction_audit,
      component_name,
      category,
      description,
    }) => {
      // Parse all JSON blobs up-front; bail out on any error
      const figmaResult = parseJsonArg<ScaffoldInput["figmaAnalysis"]>(
        figma_analysis,
        "figma_analysis"
      );
      if (!figmaResult.ok) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: figmaResult.message }],
        };
      }

      let tokenMapData: ScaffoldInput["tokenMap"];
      if (token_map) {
        const r = parseJsonArg<NonNullable<ScaffoldInput["tokenMap"]>>(
          token_map,
          "token_map"
        );
        if (!r.ok) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: r.message }],
          };
        }
        tokenMapData = r.data;
      }

      let auditData: ScaffoldInput["interactionAudit"];
      if (interaction_audit) {
        const r = parseJsonArg<NonNullable<ScaffoldInput["interactionAudit"]>>(
          interaction_audit,
          "interaction_audit"
        );
        if (!r.ok) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: r.message }],
          };
        }
        auditData = r.data;
      }

      // Resolve identity fields — always confirm via elicitation when supported
      const identity = await resolveIdentity(server, {
        component_name,
        category,
        description,
      });
      if ("error" in identity) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: identity.error }],
        };
      }
      if ("cancelled" in identity) {
        return {
          content: [{ type: "text" as const, text: identity.cancelled }],
        };
      }

      const input: ScaffoldInput = {
        componentName: identity.component_name,
        category: identity.category,
        description: identity.description,
        figmaAnalysis: figmaResult.data,
        tokenMap: tokenMapData,
        interactionAudit: auditData,
      };

      const yaml = generateScaffold(input);

      return {
        content: [{ type: "text" as const, text: yaml }],
      };
    }
  );
}

/**
 * Resolve the three identity fields (component_name, category, description)
 * via elicitation if the client supports it. Falls back to using the
 * caller-provided values if elicitation is unavailable, and errors out
 * if neither path yields a complete set.
 *
 * Option B: Always confirm — the tool args are treated as suggestions, not
 * final values. The user sees Claude's guesses and can accept or edit them.
 */
async function resolveIdentity(
  server: McpServer,
  suggestions: {
    component_name?: string;
    category?: CDFCategory;
    description?: string;
  }
): Promise<
  | { component_name: string; category: CDFCategory; description: string }
  | { error: string }
  | { cancelled: string }
> {
  const caps = server.server.getClientCapabilities();

  if (caps?.elicitation) {
    const suggestionParts: string[] = [];
    if (suggestions.component_name) {
      suggestionParts.push(`name: ${suggestions.component_name}`);
    }
    if (suggestions.category) {
      suggestionParts.push(`category: ${suggestions.category}`);
    }
    if (suggestions.description) {
      suggestionParts.push(`description: "${suggestions.description}"`);
    }
    const suggestionLine =
      suggestionParts.length > 0
        ? `\n\nClaude's suggestion — ${suggestionParts.join(", ")}`
        : "";

    const result = await server.server.elicitInput({
      mode: "form",
      message: `Scaffold a new CDF component spec. Please confirm or edit the identity fields below.${suggestionLine}`,
      requestedSchema: {
        type: "object",
        properties: {
          component_name: {
            type: "string",
            title: "Component name",
            description: "PascalCase, e.g. 'NumericPagination'",
            ...(suggestions.component_name && {
              default: suggestions.component_name,
            }),
          },
          category: {
            type: "string",
            title: "Category",
            enum: [...CDF_CATEGORIES],
            ...(suggestions.category && { default: suggestions.category }),
          },
          description: {
            type: "string",
            title: "Description",
            description: "One-sentence purpose and usage",
            ...(suggestions.description && {
              default: suggestions.description,
            }),
          },
        },
        required: ["component_name", "category", "description"],
      },
    }, { timeout: INTERACTIVE_ELICITATION_TIMEOUT_MSEC });

    if (result.action === "accept" && result.content) {
      const content = result.content as {
        component_name: string;
        category: string;
        description: string;
      };
      return {
        component_name: content.component_name,
        category: content.category as CDFCategory,
        description: content.description,
      };
    }

    return {
      cancelled:
        result.action === "decline"
          ? "Scaffold declined by user."
          : "Scaffold cancelled by user.",
    };
  }

  // Fallback: client doesn't support elicitation — require all three as args
  if (
    !suggestions.component_name ||
    !suggestions.category ||
    !suggestions.description
  ) {
    return {
      error:
        "This client does not support elicitation. Please provide component_name, category, and description as tool arguments.",
    };
  }

  return {
    component_name: suggestions.component_name,
    category: suggestions.category,
    description: suggestions.description,
  };
}
