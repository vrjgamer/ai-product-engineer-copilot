import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface MetricRecord {
  name: string;
  value: number;
  source: string;
}

export function createAnalyticsServer(metrics: MetricRecord[]): McpServer {
  const server = new McpServer({ name: "analytics", version: "0.1.0" });

  server.registerTool(
    "get_metrics",
    {
      description: "Fetch product metrics by name.",
      inputSchema: { names: z.array(z.string()) },
    },
    async ({ names }: { names: string[] }) => {
      const found = metrics.filter((metric) => names.includes(metric.name));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(found),
          },
        ],
      };
    }
  );

  return server;
}
