import type { DbClient } from "./client";

export interface Migration {
  name: string;
  sql: string;
}

/**
 * Applies any migration not yet recorded in `schema_migrations`, in name
 * order, and records it as applied. Returns the names newly applied.
 */
export async function runMigrations(
  db: DbClient,
  migrations: Migration[],
): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await db.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  const applied = new Set(rows.map((row) => row.name));

  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  const newlyApplied: string[] = [];

  for (const migration of sorted) {
    if (applied.has(migration.name)) continue;
    await db.query(migration.sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    newlyApplied.push(migration.name);
  }

  return newlyApplied;
}
