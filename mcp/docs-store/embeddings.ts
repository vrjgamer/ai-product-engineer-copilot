import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

const EMBEDDING_MODEL_ID = "text-embedding-3-small";

/**
 * Anthropic doesn't offer an embeddings API, so docs-store's indexing and
 * query-embedding steps need a separate embeddings-capable provider
 * (ARCHITECTURE.md §3 / TDD 0004) — independent of, and deliberately
 * isolated from, lib/models/provider.ts's generation-model abstraction.
 * This requires OPENAI_API_KEY regardless of MODEL_PROVIDER.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. docs-store's embeddings require an OpenAI key " +
        "regardless of MODEL_PROVIDER (see .env.example).",
    );
  }

  const model = createOpenAI({ apiKey }).textEmbeddingModel(EMBEDDING_MODEL_ID);
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
