import { describe, expect, it } from "vitest";

import { runMigrations } from "./migrate";

/**
 * An in-memory stand-in for `schema_migrations` plus whatever a migration's
 * own SQL does — good enough to prove ordering/skip logic without a real DB.
 */
function createFakeDb() {
  const appliedNames: string[] = [];
  const executedSql: string[] = [];

  return {
    appliedNames,
    executedSql,
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      const trimmed = text.trim();

      if (trimmed.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) {
        return { rows: [] };
      }
      if (trimmed === "SELECT name FROM schema_migrations") {
        return { rows: appliedNames.map((name) => ({ name })) as T[] };
      }
      if (trimmed === "INSERT INTO schema_migrations (name) VALUES ($1)") {
        appliedNames.push(params[0] as string);
        return { rows: [] };
      }

      executedSql.push(text);
      return { rows: [] };
    },
  };
}

describe("runMigrations", () => {
  it("applies pending migrations in name order", async () => {
    const db = createFakeDb();

    const applied = await runMigrations(db, [
      { name: "0002_second.sql", sql: "-- second" },
      { name: "0001_first.sql", sql: "-- first" },
    ]);

    expect(applied).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect(db.executedSql).toEqual(["-- first", "-- second"]);
  });

  it("skips migrations already recorded in schema_migrations", async () => {
    const db = createFakeDb();
    db.appliedNames.push("0001_first.sql");

    const applied = await runMigrations(db, [
      { name: "0001_first.sql", sql: "-- first" },
      { name: "0002_second.sql", sql: "-- second" },
    ]);

    expect(applied).toEqual(["0002_second.sql"]);
    expect(db.executedSql).toEqual(["-- second"]);
  });

  it("returns an empty list when every migration is already applied", async () => {
    const db = createFakeDb();
    db.appliedNames.push("0001_first.sql");

    const applied = await runMigrations(db, [{ name: "0001_first.sql", sql: "-- first" }]);

    expect(applied).toEqual([]);
    expect(db.executedSql).toEqual([]);
  });
});
