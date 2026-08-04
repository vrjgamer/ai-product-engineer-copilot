import { generateText } from "ai";

import { getModel } from "../../models/provider";
import type { NodeError } from "../state";

export async function generateNodeText(system: string, prompt: string): Promise<string> {
  const { text } = await generateText({ model: getModel(), system, prompt });
  return text;
}

export function toNodeError(node: string, error: unknown): NodeError {
  return { node, message: error instanceof Error ? error.message : String(error) };
}
