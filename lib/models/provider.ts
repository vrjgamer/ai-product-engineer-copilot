import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL_ID = "claude-haiku-4-5";

const PROVIDER_API_KEY_ENV_VAR: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * The only place in the codebase that imports a `@ai-sdk/*` provider package
 * directly. Every graph node calls `getModel()`, never a provider package.
 */
export function getModel(): LanguageModel {
  const provider = process.env.MODEL_PROVIDER ?? DEFAULT_PROVIDER;
  const modelId = process.env.MODEL_ID ?? DEFAULT_MODEL_ID;

  const apiKeyEnvVar = PROVIDER_API_KEY_ENV_VAR[provider];
  if (!apiKeyEnvVar) {
    throw new Error(
      `Unsupported MODEL_PROVIDER "${provider}". Supported providers: ${Object.keys(
        PROVIDER_API_KEY_ENV_VAR,
      ).join(", ")}.`,
    );
  }

  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) {
    throw new Error(
      `Missing ${apiKeyEnvVar} for MODEL_PROVIDER "${provider}". Set it in your environment (see .env.example).`,
    );
  }

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default:
      throw new Error(`Unsupported MODEL_PROVIDER "${provider}".`);
  }
}
