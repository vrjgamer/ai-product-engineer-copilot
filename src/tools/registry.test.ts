import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry, ToolValidationError, UnknownToolError } from "./registry.js";

describe("ToolRegistry", () => {
  it("returns a parsed, type-safe result for a valid typed schema call", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "add",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
      handler: async (input) => ({ sum: input.a + input.b }),
    });

    const result = await registry.call("add", { a: 2, b: 3 });

    expect(result).toEqual({ sum: 5 });
  });

  it("rejects malformed model output for a tool instead of silently coercing it", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "add",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
      handler: async (input) => ({ sum: input.a + input.b }),
    });

    // "3" is a numeric-looking string, not a number — must be rejected, not coerced.
    await expect(
      registry.call("add", { a: 2, b: "3" as unknown as number })
    ).rejects.toThrow(ToolValidationError);
  });

  it("fails loudly on an unknown tool name", async () => {
    const registry = new ToolRegistry();

    await expect(registry.call("does_not_exist", {})).rejects.toThrow(
      UnknownToolError
    );
  });
});
