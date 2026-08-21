import type { DbClient } from "../../lib/db/client";

export interface CitedPassage {
  sourceId: string;
  /** Includes a leading `[source:<sourceId>]` tag, same anti-hallucination discipline as the old project. */
  text: string;
}

export interface SearchDocsResult {
  passages: CitedPassage[];
}

export type EmbedQuery = (query: string) => Promise<number[]>;

interface DocChunkRow {
  source_id: string;
  content: string;
}

const DEFAULT_LIMIT = 5;

/**
 * Embeds `query` and returns the nearest indexed chunks by cosine distance.
 * `db` and `embedQuery` are injected so this stays testable against a
 * fixture DB/embedder without a real Postgres connection or embedding call
 * (ARCHITECTURE.md §8's mocked-by-default test suite).
 */
export async function searchDocs(
  db: DbClient,
  embedQuery: EmbedQuery,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<SearchDocsResult> {
  // A blank query has no nearest neighbours worth the round trip, and every
  // embeddings provider rejects it outright. Callers reach here with one when
  // an upstream node degraded (TDD 0002) — searching on a PRD that failed to
  // generate — so returning "no passages" keeps that one failure from
  // cascading into an error per downstream node.
  if (query.trim() === "") return { passages: [] };

  const embedding = await embedQuery(query);

  const { rows } = await db.query<DocChunkRow>(
    `SELECT source_id, content
     FROM doc_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), limit],
  );

  return {
    passages: rows.map((row) => ({
      sourceId: row.source_id,
      text: `[source:${row.source_id}] ${row.content}`,
    })),
  };
}
