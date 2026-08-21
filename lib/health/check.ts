import { validateEnv } from "../config/validate";
import type { DbClient } from "../db/client";

export interface HealthReport {
  ok: boolean;
  env: { ok: boolean; missing: string[] };
  database: { ok: boolean; error: string | null };
  docsCorpus: { populated: boolean; chunkCount: number | null };
  model: { provider: string; modelId: string };
  embeddings: { provider: string };
}

/**
 * TDD 0013's demo artifact, not just an ops tool: what an interviewer (or an
 * on-call session) can `curl` to get the system's own account of whether
 * it's correctly wired, instead of discovering a misconfiguration one
 * visitor-facing 500 at a time. Deliberately does no graph run and consumes
 * no rate-limit unit — `getDbClient` is a thunk, not a `DbClient`, because
 * `getDb()` throws synchronously when `DATABASE_URL` is unset, and that
 * throw is itself a health fact to report, not something to let escape as a
 * platform 500.
 */
export async function checkHealth(
  getDbClient: () => DbClient,
  env: Record<string, string | undefined> = process.env,
): Promise<HealthReport> {
  const envResult = validateEnv(env);

  let database: HealthReport["database"];
  let docsCorpus: HealthReport["docsCorpus"] = { populated: false, chunkCount: null };

  try {
    const db = getDbClient();
    await db.query("SELECT 1");
    database = { ok: true, error: null };

    try {
      const { rows } = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM doc_chunks");
      const chunkCount = Number(rows[0]?.count ?? 0);
      docsCorpus = { populated: chunkCount > 0, chunkCount };
    } catch {
      // doc_chunks may not exist yet on an unmigrated DB — leave the default
      // (populated: false, chunkCount: null), distinguishable from a
      // reachable-but-empty table (chunkCount: 0) by the migration guidance
      // in ARCHITECTURE.md §12 rather than by this endpoint guessing why.
    }
  } catch (error) {
    database = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return {
    ok: envResult.ok && database.ok,
    env: { ok: envResult.ok, missing: envResult.missing },
    database,
    docsCorpus,
    model: { provider: envResult.modelProvider, modelId: envResult.modelId },
    embeddings: { provider: envResult.embeddingProvider },
  };
}
