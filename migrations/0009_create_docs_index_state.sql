-- Backs scripts/index-docs.ts (TDD 0013): a single-row table (id pinned to
-- `true`, enforced by the CHECK constraint) recording the SHA-256 hash of the
-- last-indexed docs-store corpus, so indexing-on-deploy can skip re-embedding
-- every doc.md when only an unrelated component changed. One row because
-- there is exactly one corpus.
CREATE TABLE IF NOT EXISTS docs_index_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  corpus_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL
);
