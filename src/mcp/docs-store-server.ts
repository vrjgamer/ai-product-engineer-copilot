import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface DocRecord {
  id: string;
  title: string;
  content: string;
}

export function createDocsStoreServer(docs: DocRecord[]): McpServer {
  const server = new McpServer({ name: "docs-store", version: "0.1.0" });

  server.registerTool(
    "search_docs",
    {
      description: "Search product docs and specs for passages relevant to a query.",
      inputSchema: { query: z.string() },
    },
    async ({ query }: { query: string }) => {
      const needle = query.toLowerCase();
      const matches = docs.filter(
        (doc) =>
          doc.title.toLowerCase().includes(needle) ||
          doc.content.toLowerCase().includes(needle)
      );

      return {
        content: matches.map((doc) => ({
          type: "text" as const,
          text: `[source:${doc.id}] ${doc.title}\n${doc.content}`,
        })),
      };
    }
  );

  return server;
}
