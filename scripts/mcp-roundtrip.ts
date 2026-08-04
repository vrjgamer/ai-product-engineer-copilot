/**
 * Manual, real-infra wiring proof for TDD 0004 — not part of the mocked
 * test suite. Exercises both MCP servers for real: get_repo_stats against
 * the configured demo repo (GITHUB_TOKEN recommended, works unauthenticated
 * too) and search_docs against whatever's been indexed by
 * scripts/index-docs.ts (needs DATABASE_URL + GOOGLE_GENERATIVE_AI_API_KEY). Run with:
 *
 *   DATABASE_URL=postgres://... GOOGLE_GENERATIVE_AI_API_KEY=... npx tsx scripts/mcp-roundtrip.ts
 */
import { getRepoStatsTool, searchDocsTool } from "../mcp/tools";

const repoStats = await getRepoStatsTool();
if (typeof repoStats.stars !== "number") {
  throw new Error("get_repo_stats did not return the expected RepoStats shape.");
}
console.log("get_repo_stats OK:", repoStats);

const docsResult = await searchDocsTool("What is the graph shape of this project?");
if (docsResult.passages.length === 0) {
  throw new Error(
    "search_docs returned no passages — has scripts/index-docs.ts been run against this DATABASE_URL?",
  );
}
if (!docsResult.passages.every((passage) => passage.text.startsWith(`[source:${passage.sourceId}]`))) {
  throw new Error("search_docs passages are missing their [source:<id>] citation tag.");
}
console.log("search_docs OK:", docsResult.passages.length, "passages returned");

process.exit(0);
