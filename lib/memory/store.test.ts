import { describe, expect, it } from "vitest";

import { createMemoryStore } from "./store";

interface FakeRow {
  id: string;
  user_id: string;
  project_id: string;
  fact: string;
  written_at: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
}

/** In-memory stand-in for the `memory` table, driven by the same SQL shapes store.ts issues. */
function createFakeDb() {
  const rows: FakeRow[] = [];
  let writtenAtCounter = 0;

  return {
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      const trimmed = text.trim();

      if (trimmed.startsWith("INSERT INTO memory")) {
        const [id, userId, projectId, fact] = params as string[];
        writtenAtCounter += 1;
        rows.push({
          id,
          user_id: userId,
          project_id: projectId,
          fact,
          written_at: `2026-01-01T00:00:0${writtenAtCounter}.000Z`,
          invalidated_at: null,
          invalidated_reason: null,
        });
        return { rows: [] };
      }

      if (trimmed.startsWith("SELECT")) {
        const [userId, projectId] = params as string[];
        const matches = rows
          .filter((row) => row.user_id === userId && row.project_id === projectId && row.invalidated_at === null)
          .sort((a, b) => a.written_at.localeCompare(b.written_at));
        return { rows: matches as T[] };
      }

      if (trimmed.startsWith("UPDATE memory")) {
        const [id, reason] = params as string[];
        const row = rows.find((r) => r.id === id);
        if (row) {
          row.invalidated_at = "2026-01-02T00:00:00.000Z";
          row.invalidated_reason = reason;
        }
        return { rows: [] };
      }

      throw new Error(`Unhandled query: ${text}`);
    },
  };
}

describe("createMemoryStore", () => {
  it("never returns a record scoped to a different (userId, projectId) than requested", async () => {
    const db = createFakeDb();
    const store = createMemoryStore(db);

    await store.write({ userId: "user-a", projectId: "project-1" }, "fact for a/1");
    await store.write({ userId: "user-a", projectId: "project-2" }, "fact for a/2");
    await store.write({ userId: "user-b", projectId: "project-1" }, "fact for b/1");

    const records = await store.retrieve({ userId: "user-a", projectId: "project-1" });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      userId: "user-a",
      projectId: "project-1",
      fact: "fact for a/1",
    });
  });

  it("excludes invalidated records by default", async () => {
    const db = createFakeDb();
    const store = createMemoryStore(db);

    await store.write({ userId: "user-a", projectId: "project-1" }, "still valid");
    await store.write({ userId: "user-a", projectId: "project-1" }, "to be invalidated");

    const [, toInvalidate] = await store.retrieve({ userId: "user-a", projectId: "project-1" });
    await store.invalidate(toInvalidate.id, "superseded");

    const records = await store.retrieve({ userId: "user-a", projectId: "project-1" });

    expect(records).toHaveLength(1);
    expect(records[0].fact).toBe("still valid");
  });
});
