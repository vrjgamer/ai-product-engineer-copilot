import { randomUUID } from "node:crypto";

import type { DbClient } from "../db/client";

export interface MemoryScope {
  userId: string;
  projectId: string;
}

export interface MemoryRecord extends MemoryScope {
  id: string;
  fact: string;
  writtenAt: string;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

export interface MemoryStore {
  write(scope: MemoryScope, fact: string): Promise<void>;
  /** Active (non-invalidated) records for a scope. */
  retrieve(scope: MemoryScope): Promise<MemoryRecord[]>;
  invalidate(id: string, reason: string): Promise<void>;
}

interface MemoryRow {
  id: string;
  user_id: string;
  project_id: string;
  fact: string;
  written_at: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    fact: row.fact,
    writtenAt: row.written_at,
    invalidatedAt: row.invalidated_at,
    invalidatedReason: row.invalidated_reason,
  };
}

/**
 * Postgres-backed replacement for the previous implementation's file-backed
 * `MemoryStore` — same explicit-invalidation discipline (write once, mark
 * invalid rather than delete), same scoping by `(userId, projectId)`.
 */
export function createMemoryStore(db: DbClient): MemoryStore {
  return {
    async write(scope, fact) {
      await db.query(
        "INSERT INTO memory (id, user_id, project_id, fact) VALUES ($1, $2, $3, $4)",
        [randomUUID(), scope.userId, scope.projectId, fact],
      );
    },

    async retrieve(scope) {
      const { rows } = await db.query<MemoryRow>(
        `SELECT id, user_id, project_id, fact, written_at, invalidated_at, invalidated_reason
         FROM memory
         WHERE user_id = $1 AND project_id = $2 AND invalidated_at IS NULL
         ORDER BY written_at ASC`,
        [scope.userId, scope.projectId],
      );
      return rows.map(rowToRecord);
    },

    async invalidate(id, reason) {
      await db.query(
        "UPDATE memory SET invalidated_at = now(), invalidated_reason = $2 WHERE id = $1",
        [id, reason],
      );
    },
  };
}
