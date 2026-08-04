/**
 * Manual indexing script for mcp/docs-store — not part of the mocked test
 * suite (it makes real OpenAI embedding calls and writes to a real DB).
 * Indexes this repo's own markdown docs as the search_docs corpus (TDD
 * 0004's implementer note: this repo itself, once rebuilt, is a reasonable
 * docs-store corpus). Run with:
 *
 *   DATABASE_URL=postgres://... OPENAI_API_KEY=sk-... npx tsx scripts/index-docs.ts
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../lib/db/client";
import { embedText } from "../mcp/docs-store/embeddings";
import { indexCorpus, type CorpusDoc } from "../mcp/docs-store/indexCorpus";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const topLevelDocs = ["ARCHITECTURE.md", "VISION.md", "README.md"];
const tddDir = join(repoRoot, "docs", "tdd");
const tddFiles = (await readdir(tddDir)).filter((name) => name.endsWith(".md"));

const docs: CorpusDoc[] = await Promise.all(
  [
    ...topLevelDocs.map((name) => ({ sourceId: name, path: join(repoRoot, name) })),
    ...tddFiles.map((name) => ({ sourceId: `docs/tdd/${name}`, path: join(tddDir, name) })),
  ].map(async ({ sourceId, path }) => ({
    sourceId,
    content: await readFile(path, "utf-8"),
  })),
);

const db = getDb();
await db.query("DELETE FROM doc_chunks");
const count = await indexCorpus(db, embedText, docs);

console.log(`Indexed ${count} chunks from ${docs.length} documents.`);
process.exit(0);
