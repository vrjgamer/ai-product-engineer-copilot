import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb } from "../../lib/db/client";
import { getRepoStats } from "./getRepoStats";
import { fetchRepoStatsFromGithub } from "./github";

export const DEFAULT_DEMO_REPO = process.env.GITHUB_DEMO_REPO ?? "vrjgamer/ai-product-engineer-copilot";

/**
 * A real MCP server (ARCHITECTURE.md §3) exposing `get_repo_stats`: real
 * GitHub repository statistics, cached in `github_stats_cache` with a TTL.
 * Wires `getRepoStats` to the real DB and real GitHub API — the
 * framework-independent caching logic itself is unit-tested in
 * getRepoStats.test.ts against a fixture DB/fetcher.
 */
export function createAnalyticsServer(): McpServer {
  const server = new McpServer({ name: "analytics", version: "1.0.0" });

  server.registerTool(
    "get_repo_stats",
    {
      description:
        "Real GitHub repository statistics (stars, open issues, commit velocity, " +
        "PR merge rate), cached with a TTL.",
      inputSchema: { repo: z.string() },
      outputSchema: {
        repo: z.string(),
        stars: z.number(),
        openIssues: z.number(),
        commitVelocity: z.number(),
        prMergeRate: z.number(),
        fetchedAt: z.string(),
      },
    },
    async ({ repo }) => {
      const result = await getRepoStats(getDb(), fetchRepoStatsFromGithub, repo);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );

  return server;
}
