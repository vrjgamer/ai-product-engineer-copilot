import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Connects a fresh MCP client to `server` over a linked in-memory transport
 * pair, calls `toolName`, and tears the connection back down. This is
 * genuine MCP request/response traffic (real JSON-RPC messages, real
 * tool-call/result round trip) rather than a direct function call dressed
 * up as a "tool" — the thing ARCHITECTURE.md §3 calls out the previous
 * implementation for never doing live. It avoids the operational overhead
 * of a separate server process, matching §5's single-process request
 * architecture.
 */
export async function callMcpTool<T>(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "graph-client", version: "1.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    if (result.isError) {
      const message = Array.isArray(result.content)
        ? result.content
            .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
            .join(" ")
        : "";
      throw new Error(message || `MCP tool "${toolName}" failed`);
    }
    return result.structuredContent as T;
  } finally {
    await client.close();
    await server.close();
  }
}
