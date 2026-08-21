const MODEL_API_KEY_ENV_VAR: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const EMBEDDING_API_KEY_ENV_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export interface EnvValidationResult {
  ok: boolean;
  /** Every required var that's unset, in a stable order — never just the first one found. */
  missing: string[];
  modelProvider: string;
  modelId: string;
  embeddingProvider: string;
}

/**
 * Everything `lib/models/provider.ts`, `mcp/docs-store/embeddings.ts`,
 * `lib/db/client.ts`, and `lib/rate-limit/hashIp.ts` each discover missing
 * one throw at a time, checked up front instead (TDD 0013). The conditional
 * cases are the point: `ANTHROPIC_API_KEY` matters only when
 * `MODEL_PROVIDER=anthropic` (default), and `GOOGLE_GENERATIVE_AI_API_KEY`
 * can be required by the model layer or the embeddings layer independently —
 * either one alone makes it required, so it's deduped via a `Set` rather
 * than reported twice. `GITHUB_TOKEN` is deliberately absent: it's genuinely
 * optional (unauthenticated GitHub is 60 req/hr, comfortably inside the
 * 1-hour cache TTL from TDD 0004).
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const modelProvider = env.MODEL_PROVIDER ?? "anthropic";
  const modelId = env.MODEL_ID ?? "claude-haiku-4-5";
  const embeddingProvider = env.EMBEDDING_PROVIDER ?? "google";

  const required = new Set<string>(["DATABASE_URL", "RATE_LIMIT_IP_SALT"]);
  const modelKeyVar = MODEL_API_KEY_ENV_VAR[modelProvider];
  if (modelKeyVar) required.add(modelKeyVar);
  const embeddingKeyVar = EMBEDDING_API_KEY_ENV_VAR[embeddingProvider];
  if (embeddingKeyVar) required.add(embeddingKeyVar);

  const missing = [...required].filter((name) => !env[name]);

  return { ok: missing.length === 0, missing, modelProvider, modelId, embeddingProvider };
}

/** One loud failure naming every missing var, for the route boundary (TDD 0013) — see validateEnv() for what's required and why. */
export class ConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Server is misconfigured — missing required environment variable${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}. See .env.example.`,
    );
    this.name = "ConfigError";
    this.missing = missing;
  }
}

export function assertValidEnv(env: Record<string, string | undefined> = process.env): void {
  const result = validateEnv(env);
  if (!result.ok) throw new ConfigError(result.missing);
}
