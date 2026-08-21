import { describe, expect, it } from "vitest";

import { ConfigError, assertValidEnv, validateEnv } from "./validate";

const BASE_ENV = {
  DATABASE_URL: "postgres://localhost/test",
  RATE_LIMIT_IP_SALT: "salt",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
};

describe("validateEnv", () => {
  it("passes when every var the default provider pairing needs is set", () => {
    const result = validateEnv({ ...BASE_ENV, ANTHROPIC_API_KEY: "anthropic-key" });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.modelProvider).toBe("anthropic");
    expect(result.embeddingProvider).toBe("google");
  });

  it("names every missing var at once, not just the first", () => {
    const result = validateEnv({ MODEL_PROVIDER: "anthropic" });
    expect(result.ok).toBe(false);
    expect(result.missing.sort()).toEqual(
      ["ANTHROPIC_API_KEY", "DATABASE_URL", "GOOGLE_GENERATIVE_AI_API_KEY", "RATE_LIMIT_IP_SALT"].sort(),
    );
  });

  it("requires only the API key matching MODEL_PROVIDER, not every provider's key", () => {
    const result = validateEnv({ ...BASE_ENV, MODEL_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "g" });
    expect(result.ok).toBe(true);
  });

  it("dedupes GOOGLE_GENERATIVE_AI_API_KEY when both the model and embedding layers need it", () => {
    const result = validateEnv({
      DATABASE_URL: "postgres://localhost/test",
      RATE_LIMIT_IP_SALT: "salt",
      MODEL_PROVIDER: "google",
    });
    expect(result.missing.filter((name) => name === "GOOGLE_GENERATIVE_AI_API_KEY")).toHaveLength(1);
  });

  it("requires the embedding provider's key independently of the model provider's", () => {
    const result = validateEnv({
      DATABASE_URL: "postgres://localhost/test",
      RATE_LIMIT_IP_SALT: "salt",
      MODEL_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "a",
      EMBEDDING_PROVIDER: "openai",
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["OPENAI_API_KEY"]);
  });

  it("does not require GITHUB_TOKEN — it's genuinely optional", () => {
    const result = validateEnv({ ...BASE_ENV, ANTHROPIC_API_KEY: "a" });
    expect(result.missing).not.toContain("GITHUB_TOKEN");
  });
});

describe("assertValidEnv", () => {
  it("throws a ConfigError naming every missing var when invalid", () => {
    expect(() => assertValidEnv({})).toThrowError(ConfigError);
    try {
      assertValidEnv({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).missing).toContain("DATABASE_URL");
      expect((error as ConfigError).missing).toContain("RATE_LIMIT_IP_SALT");
    }
  });

  it("does not throw when the environment is valid", () => {
    expect(() => assertValidEnv({ ...BASE_ENV, ANTHROPIC_API_KEY: "a" })).not.toThrow();
  });
});
