import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "../db/client";
import { hashCorpus, indexCorpusIfChanged } from "./indexCorpusIfChanged";

const DOCS = [
  { sourceId: "a.md", content: "doc a" },
  { sourceId: "b.md", content: "doc b" },
];

function createFakeDb(storedHash: string | null) {
  let hash = storedHash;
  const queries: string[] = [];
  const db: DbClient = {
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      queries.push(text.trim());
      if (text.includes("SELECT corpus_hash")) {
        return { rows: (hash ? [{ corpus_hash: hash }] : []) as T[] };
      }
      if (text.trim().startsWith("DELETE FROM doc_chunks")) return { rows: [] };
      if (text.trim().startsWith("INSERT INTO doc_chunks")) return { rows: [] };
      if (text.trim().startsWith("INSERT INTO docs_index_state")) {
        hash = params[0] as string;
        return { rows: [] };
      }
      throw new Error(`Unhandled query: ${text}`);
    },
  };
  return { db, queries, getHash: () => hash };
}

describe("hashCorpus", () => {
  it("is stable regardless of doc order", () => {
    expect(hashCorpus(DOCS)).toBe(hashCorpus([...DOCS].reverse()));
  });

  it("changes when a doc's content changes", () => {
    const changed = [{ sourceId: "a.md", content: "doc a v2" }, DOCS[1]];
    expect(hashCorpus(DOCS)).not.toBe(hashCorpus(changed));
  });
});

describe("indexCorpusIfChanged", () => {
  it("skips re-indexing (and makes no embedding calls) when the stored hash matches", async () => {
    const { db, queries } = createFakeDb(hashCorpus(DOCS));
    const embedText = vi.fn(async () => [0]);

    const result = await indexCorpusIfChanged(db, embedText, DOCS);

    expect(result).toEqual({ skipped: true, chunkCount: 0 });
    expect(embedText).not.toHaveBeenCalled();
    expect(queries.some((q) => q.startsWith("DELETE FROM doc_chunks"))).toBe(false);
  });

  it("re-indexes and stores the new hash when the corpus changed", async () => {
    const { db, getHash } = createFakeDb("old-hash");
    const embedText = vi.fn(async () => [0]);

    const result = await indexCorpusIfChanged(db, embedText, DOCS);

    expect(result.skipped).toBe(false);
    expect(result.chunkCount).toBe(2);
    expect(embedText).toHaveBeenCalledTimes(2);
    expect(getHash()).toBe(hashCorpus(DOCS));
  });

  it("re-indexes on first run, when no hash is stored yet", async () => {
    const { db } = createFakeDb(null);
    const embedText = vi.fn(async () => [0]);

    const result = await indexCorpusIfChanged(db, embedText, DOCS);

    expect(result.skipped).toBe(false);
    expect(result.chunkCount).toBe(2);
  });
});
