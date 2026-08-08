import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit } from "./check";
import { hashIp } from "./hashIp";

const SALT = "test-salt";
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

interface Row {
  ip_hash: string;
  window_start: string;
  count: number;
}

function createFakeDb(initialRows: Row[] = []) {
  const rows = [...initialRows];
  const calls: { text: string; params: unknown[] }[] = [];

  return {
    rows,
    calls,
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      calls.push({ text, params });
      const trimmed = text.trim();

      if (trimmed.startsWith("SELECT count")) {
        const [ipHash, windowStart] = params as [string, Date];
        const match = rows.find(
          (row) => row.ip_hash === ipHash && row.window_start === windowStart.toISOString(),
        );
        return { rows: (match ? [{ count: match.count }] : []) as T[] };
      }

      if (trimmed.startsWith("INSERT INTO rate_limits")) {
        const [ipHash, windowStart] = params as [string, Date];
        const key = windowStart.toISOString();
        const existing = rows.find((row) => row.ip_hash === ipHash && row.window_start === key);
        if (existing) existing.count += 1;
        else rows.push({ ip_hash: ipHash, window_start: key, count: 1 });
        return { rows: [] };
      }

      throw new Error(`Unhandled query: ${text}`);
    },
  };
}

beforeEach(() => {
  process.env.RATE_LIMIT_IP_SALT = SALT;
});

describe("checkRateLimit", () => {
  it("allows a fresh IP with no prior rows", async () => {
    const db = createFakeDb();

    const result = await checkRateLimit("203.0.113.7", db, LIMIT, WINDOW_MS, () => new Date("2026-01-01T00:00:00.000Z"));

    expect(result).toEqual({ allowed: true });
  });

  it("rejects an IP at the configured limit within the current window, with a correct retryAfterSeconds", async () => {
    const windowStart = "2026-01-01T00:00:00.000Z";
    const db = createFakeDb([{ ip_hash: hashIp("203.0.113.7", SALT), window_start: windowStart, count: LIMIT }]);

    const result = await checkRateLimit(
      "203.0.113.7",
      db,
      LIMIT,
      WINDOW_MS,
      () => new Date("2026-01-01T00:20:00.000Z"),
    );

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 40 * 60 });
  });

  it("resets the count once the window has elapsed", async () => {
    const db = createFakeDb([
      { ip_hash: hashIp("203.0.113.7", SALT), window_start: "2026-01-01T00:00:00.000Z", count: LIMIT },
    ]);

    // A full window later — a new window_start, so the prior window's count doesn't apply.
    const result = await checkRateLimit(
      "203.0.113.7",
      db,
      LIMIT,
      WINDOW_MS,
      () => new Date("2026-01-01T01:00:00.000Z"),
    );

    expect(result).toEqual({ allowed: true });
  });

  it("never lets the raw IP reach a DB call — only the hashed value is ever passed as a query argument", async () => {
    const db = createFakeDb();
    const rawIp = "203.0.113.7";

    await checkRateLimit(rawIp, db, LIMIT, WINDOW_MS, () => new Date("2026-01-01T00:00:00.000Z"));

    expect(db.calls.length).toBeGreaterThan(0);
    for (const call of db.calls) {
      expect(call.params).not.toContain(rawIp);
      expect(JSON.stringify(call.params)).not.toContain(rawIp);
    }
    expect(db.calls.some((call) => call.params.includes(hashIp(rawIp, SALT)))).toBe(true);
  });
});
