-- Backs mcp/docs-store's search_docs tool: an indexed corpus of chunked,
-- embedded markdown docs for pgvector similarity search. mcp/docs-store/
-- embeddings.ts truncates whichever provider EMBEDDING_PROVIDER selects
-- (OpenAI or Google) to a fixed 1536 dims, so this column's width doesn't
-- depend on which one is configured — just don't switch providers on an
-- already-indexed corpus without re-indexing (embeddings across
-- models/providers aren't comparable).
CREATE TABLE IF NOT EXISTS doc_chunks (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);

CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
  ON doc_chunks USING ivfflat (embedding vector_cosine_ops);
