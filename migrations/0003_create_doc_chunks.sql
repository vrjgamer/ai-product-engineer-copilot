-- Backs mcp/docs-store's search_docs tool: an indexed corpus of chunked,
-- embedded markdown docs for pgvector similarity search. text-embedding-3-small
-- (mcp/docs-store/embeddings.ts) produces 1536-dim vectors.
CREATE TABLE IF NOT EXISTS doc_chunks (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);

CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
  ON doc_chunks USING ivfflat (embedding vector_cosine_ops);
