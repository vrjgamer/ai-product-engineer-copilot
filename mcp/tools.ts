import { createAnalyticsServer, getDefaultDemoRepo } from "./analytics/server";
import type { RepoStats } from "./analytics/getRepoStats";
import { callMcpTool } from "./client";
import { createDocsStoreServer } from "./docs-store/server";
import type { SearchDocsResult } from "./docs-store/searchDocs";
import { emitMcpCall } from "../lib/graph/progress";
import { recordMcpCall } from "../lib/tracing/collect";

/**
 * Reports an MCP tool call's start/completion to TDD 0005's streaming route
 * and records it against the current node's trace (TDD 0007) — both are
 * no-ops outside their respective run wrappers — without changing this
 * function's return value or thrown errors.
 */
async function withMcpCallProgress<T>(tool: string, call: () => Promise<T>): Promise<T> {
  emitMcpCall(tool, "started");
  recordMcpCall(tool);
  try {
    const result = await call();
    emitMcpCall(tool, "completed");
    return result;
  } catch (error) {
    emitMcpCall(tool, "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** The graph's only entry point into docs-store — see mcp/client.ts for the real MCP round trip underneath. */
export async function searchDocsTool(query: string): Promise<SearchDocsResult> {
  return withMcpCallProgress("search_docs", () =>
    callMcpTool<SearchDocsResult>(createDocsStoreServer(), "search_docs", { query }),
  );
}

/** The graph's only entry point into analytics — see mcp/client.ts for the real MCP round trip underneath. */
export async function getRepoStatsTool(repo: string = getDefaultDemoRepo()): Promise<RepoStats> {
  return withMcpCallProgress("get_repo_stats", () =>
    callMcpTool<RepoStats>(createAnalyticsServer(), "get_repo_stats", { repo }),
  );
}

export function formatDocsContext(result: SearchDocsResult): string {
  if (result.passages.length === 0) return "";
  return `Relevant docs:\n${result.passages.map((passage) => passage.text).join("\n")}`;
}

export function formatRepoStats(stats: RepoStats): string {
  return (
    `GitHub stats for ${stats.repo}: ${stats.stars} stars, ${stats.openIssues} open issues, ` +
    `${stats.commitVelocity} commits in the last 7 days, ` +
    `${Math.round(stats.prMergeRate * 100)}% PR merge rate.`
  );
}
