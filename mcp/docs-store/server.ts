import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb } from "../../lib/db/client";
import { embedText } from "./embeddings";
import { searchDocs } from "./searchDocs";

/**
 * A real MCP server (ARCHITECTURE.md §3) exposing `search_docs`:
 * embedding-based similarity search over the indexed docs corpus. Wires
 * `searchDocs` to the real DB and real embeddings provider — the
 * framework-independent logic itself is unit-tested in searchDocs.test.ts
 * against a fixture DB/embedder.
 */
export function createDocsStoreServer(): McpServer {
  const server = new McpServer({ name: "docs-store", version: "1.0.0" });

  server.registerTool(
    "search_docs",
    {
      description:
        "Embedding-based similarity search over the indexed docs corpus. " +
        "Returns cited passages, each tagged [source:<id>].",
      inputSchema: { query: z.string() },
      outputSchema: {
        passages: z.array(z.object({ sourceId: z.string(), text: z.string() })),
      },
    },
    async ({ query }) => {
      const result = await searchDocs(getDb(), embedText, query);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );

  return server;
}
