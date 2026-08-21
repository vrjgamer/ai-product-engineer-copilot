import { createHash } from "node:crypto";

import type { DbClient } from "../db/client";
import { indexCorpus, type CorpusDoc } from "../../mcp/docs-store/indexCorpus";

/** Order-independent (sorted by sourceId) so reordering scripts/index-docs.ts's doc list doesn't look like a corpus change. */
export function hashCorpus(docs: CorpusDoc[]): string {
  const hash = createHash("sha256");
  for (const doc of [...docs].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    hash.update(doc.sourceId);
    hash.update("\0");
    hash.update(doc.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export interface IndexResult {
  skipped: boolean;
  chunkCount: number;
}

/**
 * TDD 0013: indexing-on-deploy shouldn't become a build-time embeddings bill
 * — a deploy that changes only an unrelated component re-embeds nothing.
 * Compares the corpus's hash against `docs_index_state` (migration 0009) and
 * skips the delete-and-reinsert (and every embedding call it would make)
 * when unchanged.
 */
export async function indexCorpusIfChanged(
  db: DbClient,
  embedText: (text: string) => Promise<number[]>,
  docs: CorpusDoc[],
): Promise<IndexResult> {
  const hash = hashCorpus(docs);
  const { rows } = await db.query<{ corpus_hash: string }>("SELECT corpus_hash FROM docs_index_state LIMIT 1");

  if (rows[0]?.corpus_hash === hash) {
    return { skipped: true, chunkCount: 0 };
  }

  await db.query("DELETE FROM doc_chunks");
  const chunkCount = await indexCorpus(db, embedText, docs);
  await db.query(
    `INSERT INTO docs_index_state (id, corpus_hash, indexed_at) VALUES (true, $1, now())
     ON CONFLICT (id) DO UPDATE SET corpus_hash = EXCLUDED.corpus_hash, indexed_at = EXCLUDED.indexed_at`,
    [hash],
  );

  return { skipped: false, chunkCount };
}
