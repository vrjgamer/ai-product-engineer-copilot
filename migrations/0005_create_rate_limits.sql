-- Backs lib/rate-limit/check.ts's IP-based limiter (TDD 0006,
-- ARCHITECTURE.md §6): one row per (hashed IP, fixed hour-aligned window).
-- `ip_hash` only — raw IPs are never written to this table.
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_start)
);
