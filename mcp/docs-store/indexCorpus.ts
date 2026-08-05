import { randomUUID } from "node:crypto";

import type { DbClient } from "../../lib/db/client";

export interface CorpusDoc {
  sourceId: string;
  content: string;
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

/** Fixed-size character chunking with overlap — boring and good enough for this corpus's scale. */
export function chunkDoc(content: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    const chunk = content.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end === content.length) break;
    start = end - overlap;
  }

  return chunks;
}

/** Chunks and embeds each doc into `doc_chunks`. Returns the number of chunks written. */
export async function indexCorpus(
  db: DbClient,
  embedText: (text: string) => Promise<number[]>,
  docs: CorpusDoc[],
): Promise<number> {
  let count = 0;

  for (const doc of docs) {
    const chunks = chunkDoc(doc.content);
    for (const [chunkIndex, content] of chunks.entries()) {
      const embedding = await embedText(content);
      await db.query(
        `INSERT INTO doc_chunks (id, source_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [randomUUID(), doc.sourceId, chunkIndex, content, JSON.stringify(embedding)],
      );
      count += 1;
    }
  }

  return count;
}
