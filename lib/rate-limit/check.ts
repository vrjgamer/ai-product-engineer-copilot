import { getDb, type DbClient } from "../db/client";
import { hashIp } from "./hashIp";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

function getConfiguredLimit(): number {
  const raw = process.env.RATE_LIMIT_MAX_RUNS_PER_HOUR;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

interface CountRow {
  count: number;
}

/**
 * IP-based limiter (TDD 0006, ARCHITECTURE.md §6): fixed, hour-aligned
 * windows keyed by the *hashed* IP — `ip` is hashed here, before it ever
 * reaches a `db.query` call, so the raw address is never persisted.
 * `db`/`limit`/`windowMs`/`now` are injected (mirrors
 * `mcp/analytics/getRepoStats.ts`) so this is testable against a fixture DB
 * and mocked time instead of a real Postgres instance and real clock.
 */
export async function checkRateLimit(
  ip: string,
  db: DbClient = getDb(),
  limit: number = getConfiguredLimit(),
  windowMs: number = DEFAULT_WINDOW_MS,
  now: () => Date = () => new Date(),
): Promise<RateLimitResult> {
  const ipHash = hashIp(ip);
  const windowStartMs = Math.floor(now().getTime() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);

  const { rows } = await db.query<CountRow>(
    `SELECT count FROM rate_limits WHERE ip_hash = $1 AND window_start = $2`,
    [ipHash, windowStart],
  );
  const currentCount = rows[0]?.count ?? 0;

  if (currentCount >= limit) {
    const retryAfterSeconds = Math.max(0, Math.ceil((windowStartMs + windowMs - now().getTime()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  await db.query(
    `INSERT INTO rate_limits (ip_hash, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (ip_hash, window_start) DO UPDATE SET count = rate_limits.count + 1`,
    [ipHash, windowStart],
  );

  return { allowed: true };
}
