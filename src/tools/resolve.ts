import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCDFFile, resolveInheritance, resolveExtension } from "@formtrieb/cdf-core";
import type { CDFComponent } from "@formtrieb/cdf-core";
import { resolveComponent } from "../utils.js";
import { dirname, resolve } from "node:path";

export function registerResolveTools(
  server: McpServer,
  specDirectories: string[]
) {
  server.registerTool(
    "cdf_resolve",
    {
      description:
        "Resolve inheritance/extension for a child component spec, returning the complete merged result. If the component doesn't use inherits/extends, returns the spec unchanged. Use show_origin to annotate which fields came from parent vs child.",
      inputSchema: {
        component: z
          .string()
          .min(1)
          .describe("Component name or file path of the child spec"),
        show_origin: z
          .boolean()
          .default(false)
          .describe("Annotate each field with whether it came from parent or child"),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ component, show_origin }) => {
      const filePath = resolveComponent(component, specDirectories);
      const child = parseCDFFile(filePath);

      if (!child.inherits && !child.extends) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: `${child.name} does not use inherits or extends. Returning spec as-is.`,
                  spec: child,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const parentRef = child.inherits ?? child.extends!;
      const parentPath = resolve(dirname(filePath), parentRef);
      const parent = parseCDFFile(parentPath);

      let result: unknown;
      if (child.inherits) {
        const resolved = resolveInheritance(child, parent);
        result = show_origin
          ? annotateOrigin(resolved, parent, child)
          : resolved;
      } else {
        result = resolveExtension(child, parent);
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

/**
 * Annotate resolved properties with their origin (parent vs child).
 */
function annotateOrigin(
  resolved: CDFComponent,
  parent: CDFComponent,
  child: CDFComponent
): Record<string, unknown> {
  const annotated: Record<string, unknown> = {};

  // Identity fields always from child
  annotated.name = { value: resolved.name, origin: "child" };
  annotated.category = { value: resolved.category, origin: "child" };
  annotated.description = { value: resolved.description, origin: "child" };

  // Properties
  if (resolved.properties) {
    const props: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(resolved.properties)) {
      if (child.properties_added && name in child.properties_added) {
        props[name] = { value: prop, origin: "child (added)" };
      } else if (parent.properties && name in parent.properties) {
        props[name] = { value: prop, origin: "parent" };
      } else {
        props[name] = { value: prop, origin: "unknown" };
      }
    }
    // Show removed properties
    if (child.properties_removed) {
      for (const name of child.properties_removed) {
        props[name] = { origin: "removed" };
      }
    }
    annotated.properties = props;
  }

  // For other sections, just mark origin
  for (const key of Object.keys(resolved) as (keyof CDFComponent)[]) {
    if (key === "name" || key === "category" || key === "description" || key === "properties") {
      continue;
    }
    const value = resolved[key];
    if (value === undefined) continue;

    const fromChild = child[key] !== undefined;
    annotated[key] = {
      value,
      origin: fromChild ? "child" : "parent",
    };
  }

  return annotated;
}
