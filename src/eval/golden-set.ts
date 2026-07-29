import { z } from "zod";

export const GoldenCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  rubric: z.string(),
  baselineScore: z.number().min(0).max(1).optional(),
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export class GoldenSetValidationError extends Error {
  constructor(index: number, cause: unknown) {
    super(`Golden set entry at index ${index} is invalid: ${String(cause)}`);
    this.name = "GoldenSetValidationError";
  }
}

export function loadGoldenSet(raw: unknown[]): GoldenCase[] {
  return raw.map((entry, index) => {
    const parsed = GoldenCaseSchema.safeParse(entry);
    if (!parsed.success) {
      throw new GoldenSetValidationError(index, parsed.error);
    }
    return parsed.data;
  });
}
