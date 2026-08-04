import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

const DEFAULT_EMBEDDING_PROVIDER = "google";

const EMBEDDING_MODEL_ID: Record<string, string> = {
  openai: "text-embedding-3-small",
  google: "gemini-embedding-001",
};

const EMBEDDING_API_KEY_ENV_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

// Both providers are asked to truncate to this size (OpenAI via `dimensions`,
// Google via `outputDimensionality`) so the pgvector column's fixed width
// stays valid regardless of which one EMBEDDING_PROVIDER selects. Whichever
// provider indexed the corpus is the one that must be configured to query
// it — embeddings from different models/providers aren't comparable.
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Anthropic doesn't offer an embeddings API, so docs-store's indexing and
 * query-embedding steps need a separate embeddings-capable provider
 * (ARCHITECTURE.md §3 / TDD 0004) — independent of, and deliberately
 * isolated from, lib/models/provider.ts's generation-model abstraction, but
 * following the same "one env var picks the provider" pattern so this isn't
 * locked to a single LLM vendor. Defaults to Google since Anthropic (the
 * generation default) has no embeddings API of its own.
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = process.env.EMBEDDING_PROVIDER ?? DEFAULT_EMBEDDING_PROVIDER;
  const modelId = EMBEDDING_MODEL_ID[provider];
  if (!modelId) {
    throw new Error(
      `Unsupported EMBEDDING_PROVIDER "${provider}". Supported providers: ${Object.keys(
        EMBEDDING_MODEL_ID,
      ).join(", ")}.`,
    );
  }

  const apiKeyEnvVar = EMBEDDING_API_KEY_ENV_VAR[provider];
  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `Missing ${apiKeyEnvVar} for EMBEDDING_PROVIDER "${provider}" (see .env.example).`,
    );
  }

  switch (provider) {
    case "openai": {
      const model = createOpenAI({ apiKey }).textEmbeddingModel(modelId);
      const { embedding } = await embed({
        model,
        value: text,
        providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
      });
      return embedding;
    }
    case "google": {
      const model = createGoogleGenerativeAI({ apiKey }).textEmbeddingModel(modelId);
      const { embedding } = await embed({
        model,
        value: text,
        providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
      });
      return embedding;
    }
    default:
      throw new Error(`Unsupported EMBEDDING_PROVIDER "${provider}".`);
  }
}
