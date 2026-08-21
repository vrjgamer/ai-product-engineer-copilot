import type { NodeTrace } from "./record";

export interface TokenPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

/**
 * Per-token pricing (USD per 1M tokens), keyed by `${provider}:${modelId}` —
 * only the models actually reachable via lib/models/provider.ts's
 * MODEL_PROVIDER/MODEL_ID env vars (its three supported providers' default
 * models). Hardcoded and explicit rather than pulled from a pricing API,
 * per TDD 0007: pricing changes rarely enough that updating this table by
 * hand is the right level of engineering for a demo project. Update the
 * relevant row when a listed model's published pricing changes, or add a
 * row when the deployed MODEL_ID changes.
 */
const PRICING_BY_PROVIDER_MODEL: Record<string, TokenPricing> = {
  "anthropic:claude-haiku-4-5": { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
  "openai:gpt-4o-mini": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  // Introductory pricing, published as running through 2026-12-31; the
  // standard rate after that is $1.50/$7.50, so this row has a known
  // expiry rather than the open-ended life the others have.
  "google:gemini-3.6-flash": { inputPerMillionUsd: 0.75, outputPerMillionUsd: 3.75 },
  // Retired by Google (the API now refuses it and points at 3.6). Kept so
  // historical `/trace/[runId]` pages for runs made on it still price their
  // stored token counts instead of silently reporting $0.
  "google:gemini-2.0-flash": { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
};

const UNKNOWN_MODEL_PRICING: TokenPricing = { inputPerMillionUsd: 0, outputPerMillionUsd: 0 };

/** Falls back to zero rather than throwing — an unrecognized model shouldn't crash trace recording, just report an untracked ($0) cost. */
export function getPricing(provider: string, modelId: string): TokenPricing {
  return PRICING_BY_PROVIDER_MODEL[`${provider}:${modelId}`] ?? UNKNOWN_MODEL_PRICING;
}

/** Sums every node's real recorded token counts (not a flat per-run estimate) and prices them. */
export function computeTotalCostUsd(nodes: NodeTrace[], pricing: TokenPricing): number {
  const totals = nodes.reduce(
    (acc, node) => ({
      inputTokens: acc.inputTokens + (node.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (node.outputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 },
  );

  return (
    (totals.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (totals.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
}
