import { describe, expect, it } from "vitest";

import { chunkDoc, indexCorpus } from "./indexCorpus";

describe("chunkDoc", () => {
  it("returns a single chunk for content shorter than chunkSize", () => {
    const chunks = chunkDoc("short doc", 1000, 100);
    expect(chunks).toEqual(["short doc"]);
  });

  it("returns a single chunk for content exactly chunkSize long", () => {
    const content = "a".repeat(1000);
    const chunks = chunkDoc(content, 1000, 100);
    expect(chunks).toEqual([content]);
  });

  it("splits longer content into overlapping chunks", () => {
    const content = "a".repeat(1001);
    const chunks = chunkDoc(content, 1000, 100);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1000);
    // The second chunk starts 100 chars before the first one ends (the overlap).
    expect(chunks[1]).toHaveLength(101);
  });

  it("returns an empty array for empty content", () => {
    expect(chunkDoc("", 1000, 100)).toEqual([]);
  });

  it("drops a chunk that's all whitespace after trimming", () => {
    const content = `${"a".repeat(500)}${" ".repeat(500)}${"b".repeat(500)}`;
    const chunks = chunkDoc(content, 500, 0);

    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
    expect(chunks.join("")).not.toContain("  ");
  });
});

describe("indexCorpus", () => {
  function createFakeDb() {
    const inserted: { sourceId: string; chunkIndex: number; content: string; embedding: string }[] = [];
    return {
      inserted,
      async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
        if (text.trim().startsWith("INSERT INTO doc_chunks")) {
          const [, sourceId, chunkIndex, content, embedding] = params as [
            string,
            string,
            number,
            string,
            string,
          ];
          inserted.push({ sourceId, chunkIndex, content, embedding });
          return { rows: [] };
        }
        throw new Error(`Unhandled query: ${text}`);
      },
    };
  }

  it("chunks and embeds every doc, returning the total chunk count", async () => {
    const db = createFakeDb();
    const embedText = async (text: string) => [text.length];

    const count = await indexCorpus(db, embedText, [
      { sourceId: "a.md", content: "short doc a" },
      { sourceId: "b.md", content: "short doc b" },
    ]);

    expect(count).toBe(2);
    expect(db.inserted.map((row) => row.sourceId)).toEqual(["a.md", "b.md"]);
    expect(db.inserted[0].content).toBe("short doc a");
  });

  it("assigns sequential chunk_index values per document", async () => {
    const db = createFakeDb();
    const embedText = async () => [0];
    const content = "a".repeat(2200);

    await indexCorpus(db, embedText, [{ sourceId: "big.md", content }]);

    expect(db.inserted.map((row) => row.chunkIndex)).toEqual([0, 1, 2]);
  });
});
