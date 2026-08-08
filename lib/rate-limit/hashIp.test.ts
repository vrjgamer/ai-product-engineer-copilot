import { describe, expect, it } from "vitest";

import { hashIp } from "./hashIp";

describe("hashIp", () => {
  it("never returns the raw IP", () => {
    expect(hashIp("203.0.113.7", "salt-a")).not.toBe("203.0.113.7");
  });

  it("is deterministic for the same IP and salt", () => {
    expect(hashIp("203.0.113.7", "salt-a")).toBe(hashIp("203.0.113.7", "salt-a"));
  });

  it("differs across IPs given the same salt", () => {
    expect(hashIp("203.0.113.7", "salt-a")).not.toBe(hashIp("203.0.113.8", "salt-a"));
  });

  it("differs across salts given the same IP", () => {
    expect(hashIp("203.0.113.7", "salt-a")).not.toBe(hashIp("203.0.113.7", "salt-b"));
  });

  it("throws when no salt is configured and none is passed explicitly", () => {
    const original = process.env.RATE_LIMIT_IP_SALT;
    delete process.env.RATE_LIMIT_IP_SALT;

    try {
      expect(() => hashIp("203.0.113.7")).toThrow(/RATE_LIMIT_IP_SALT/);
    } finally {
      if (original !== undefined) process.env.RATE_LIMIT_IP_SALT = original;
    }
  });
});
