import { describe, expect, it } from "vitest";

import { searchDocs } from "./searchDocs";

interface FixtureRow {
  source_id: string;
  content: string;
}

function createFakeDb(rows: FixtureRow[]) {
  return {
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      if (text.trim().startsWith("SELECT source_id, content")) {
        const limit = params[1] as number;
        return { rows: rows.slice(0, limit) as T[] };
      }
      throw new Error(`Unhandled query: ${text}`);
    },
  };
}

describe("searchDocs", () => {
  it("returns passages carrying a [source:<id>] tag traceable to a specific indexed document", async () => {
    const db = createFakeDb([
      { source_id: "ARCHITECTURE.md", content: "The graph shape is Supervisor -> PRD -> fan-out." },
    ]);
    const embedQuery = async () => [0.1, 0.2, 0.3];

    const result = await searchDocs(db, embedQuery, "graph shape");

    expect(result.passages).toHaveLength(1);
    expect(result.passages[0].sourceId).toBe("ARCHITECTURE.md");
    expect(result.passages[0].text).toBe(
      "[source:ARCHITECTURE.md] The graph shape is Supervisor -> PRD -> fan-out.",
    );
  });

  it("embeds the query before searching", async () => {
    const db = createFakeDb([]);
    let embeddedQuery: string | undefined;
    const embedQuery = async (query: string) => {
      embeddedQuery = query;
      return [1, 0, 0];
    };

    await searchDocs(db, embedQuery, "how does checkpointing work");

    expect(embeddedQuery).toBe("how does checkpointing work");
  });

  it("returns no passages without calling the embeddings API when the query is blank", async () => {
    // TDD 0002's graceful degradation means an upstream node can hand a
    // downstream one an empty deliverable — userStoryAgent and
    // architectureReviewAgent both search on the PRD's text. Embedding "" is
    // rejected by the provider ("EmbedContentRequest.content contains an empty
    // Part"), which turned one node's degradation into three more errors and
    // spent an API call to earn each one.
    const db = createFakeDb([{ source_id: "a.md", content: "a" }]);
    let embedCalls = 0;
    const embedQuery = async () => {
      embedCalls += 1;
      return [0.1];
    };

    const result = await searchDocs(db, embedQuery, "   ");

    expect(result.passages).toEqual([]);
    expect(embedCalls).toBe(0);
  });

  it("respects the requested limit", async () => {
    const db = createFakeDb([
      { source_id: "a.md", content: "a" },
      { source_id: "b.md", content: "b" },
      { source_id: "c.md", content: "c" },
    ]);

    const result = await searchDocs(db, async () => [0], "query", 2);

    expect(result.passages).toHaveLength(2);
  });
});
