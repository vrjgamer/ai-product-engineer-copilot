import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpCallResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export interface McpLogger {
  logToolFailure(serverName: string, toolName: string, error: unknown): void;
}

/**
 * Wraps an MCP SDK client so a server being unreachable degrades to a typed
 * failure result instead of throwing into the executor (see ARCHITECTURE.md §3).
 */
export class McpToolClient {
  private connected = false;

  constructor(
    private readonly serverName: string,
    private readonly client: Client,
    private readonly logger: McpLogger
  ) {}

  async connect(transport: Transport): Promise<void> {
    try {
      await this.client.connect(transport);
      this.connected = true;
    } catch (error) {
      this.logger.logToolFailure(this.serverName, "connect", error);
    }
  }

  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult<T>> {
    if (!this.connected) {
      const error = new Error(`MCP server "${this.serverName}" is unreachable`);
      this.logger.logToolFailure(this.serverName, toolName, error);
      return { ok: false, error };
    }

    try {
      const value = await this.client.callTool({ name: toolName, arguments: args });
      return { ok: true, value: value as T };
    } catch (error) {
      this.logger.logToolFailure(this.serverName, toolName, error);
      return { ok: false, error };
    }
  }
}
