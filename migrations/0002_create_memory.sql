-- Backs lib/memory/store.ts. Scoped by (user_id, project_id); rows are
-- never deleted, only marked invalid, matching the previous file-backed
-- MemoryStore's explicit-invalidation discipline.
CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  invalidated_reason TEXT
);

CREATE INDEX IF NOT EXISTS memory_scope_idx ON memory (user_id, project_id);
