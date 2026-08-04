/**
 * Provisioning CLI — reads migrations/*.sql in order, applies any not yet
 * recorded in schema_migrations, and sets up the LangGraph checkpoint
 * tables (idempotent). Run with:
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getCheckpointer } from "../lib/db/checkpointer";
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const fileNames = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql"));
const migrations = await Promise.all(
  fileNames.map(async (name) => ({
    name,
    sql: await readFile(join(migrationsDir, name), "utf-8"),
  })),
);

const db = getDb();
const applied = await runMigrations(db, migrations);

console.log(applied.length > 0 ? `Applied: ${applied.join(", ")}` : "No pending migrations.");

await getCheckpointer().setup();
console.log("Checkpoint tables ready.");

// The pg Pool keeps the event loop alive; exit explicitly once migrations are done.
process.exit(0);
