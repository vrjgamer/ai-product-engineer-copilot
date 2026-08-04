/**
 * Manual, one-time wiring proof for TDD 0001 — not part of the mocked test
 * suite. Run with a real API key set:
 *
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/model-roundtrip.ts
 */
import { generateText } from "ai";
import { getModel } from "../lib/models/provider";

const { text } = await generateText({
  model: getModel(),
  prompt: "Reply with exactly one short sentence confirming you received this message.",
});

console.log(text);
