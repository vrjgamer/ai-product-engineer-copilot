/**
 * Vercel (and most proxies in front of Node) set `x-forwarded-for` to a
 * comma-separated list, client IP first. No proxy in front of `next dev`
 * sets it at all, so "unknown" is the local-dev fallback rather than an
 * error — the limiter still works, just bucketed as one shared "unknown"
 * visitor.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
