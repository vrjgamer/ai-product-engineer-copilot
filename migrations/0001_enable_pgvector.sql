-- Enables pgvector for this database. TDD 0004 adds docs-store's actual
-- embeddings table; this just makes the extension available ahead of time
-- so that migration doesn't need its own extension-setup step.
CREATE EXTENSION IF NOT EXISTS vector;
