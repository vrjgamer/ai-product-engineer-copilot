import { getDb } from "../../../lib/db/client";
import { checkHealth } from "../../../lib/health/check";

// Node.js runtime, not Edge — checkHealth() talks to the same Postgres pool
// as every other route (ARCHITECTURE.md §5).
export const runtime = "nodejs";

/**
 * TDD 0013: `GET /api/health` — env validity, DB reachability, whether
 * `doc_chunks` is populated, and the resolved provider/model. Consumes no
 * rate-limit unit, runs no graph, leaks no secret values. A 503 means the
 * deployment is misconfigured or unreachable; 200 means it's wired
 * correctly, which was not true for days before this endpoint existed.
 */
export async function GET(): Promise<Response> {
  const report = await checkHealth(getDb);
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
