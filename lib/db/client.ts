import { Pool } from "pg";

export interface DbClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

let pool: Pool | undefined;

/**
 * The only place in the codebase that constructs a `pg` pool directly —
 * every consumer calls `getDb()`, never `new Pool()`.
 */
export function getDb(): DbClient {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "Missing DATABASE_URL. Set it in your environment (see .env.example).",
      );
    }
    pool = new Pool({ connectionString });
    // node-postgres emits 'error' on the pool for idle-client failures (e.g.
    // Neon closing an idle connection); without a listener that's an
    // unhandled exception that crashes the process.
    pool.on("error", (err) => {
      console.error("Unexpected error on idle Postgres client", err);
    });
  }
  return pool;
}
