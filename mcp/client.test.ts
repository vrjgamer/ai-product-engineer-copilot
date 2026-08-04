import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { callMcpTool } from "./client";

function createTestServer(): McpServer {
  const server = new McpServer({ name: "test-server", version: "1.0.0" });

  server.registerTool(
    "echo",
    { inputSchema: { text: z.string() }, outputSchema: { text: z.string() } },
    async ({ text }) => ({
      content: [{ type: "text", text }],
      structuredContent: { text },
    }),
  );

  server.registerTool("boom", {}, async () => {
    throw new Error("simulated failure");
  });

  return server;
}

describe("callMcpTool", () => {
  it("round-trips a call through a real MCP client/server pair", async () => {
    const result = await callMcpTool<{ text: string }>(createTestServer(), "echo", {
      text: "hello",
    });

    expect(result).toEqual({ text: "hello" });
  });

  it("throws with the tool's error message when the server-side handler throws", async () => {
    await expect(callMcpTool(createTestServer(), "boom", {})).rejects.toThrow(
      "simulated failure",
    );
  });
});
