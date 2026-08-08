import { createHmac } from "node:crypto";

/**
 * Salts before hashing (TDD 0006: "hash the visitor's IP with a
 * server-side salt before writing it — never persist raw IPs") so the
 * stored value can't be reversed or correlated across deployments even if
 * the DB leaks.
 */
export function hashIp(ip: string, salt: string = requireSalt()): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

function requireSalt(): string {
  const salt = process.env.RATE_LIMIT_IP_SALT;
  if (!salt) {
    throw new Error(
      "Missing RATE_LIMIT_IP_SALT. Set it in your environment (see .env.example).",
    );
  }
  return salt;
}
