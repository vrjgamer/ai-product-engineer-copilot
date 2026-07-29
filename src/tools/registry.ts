import type { z } from "zod";

export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`Unknown tool: "${name}"`);
    this.name = "UnknownToolError";
  }
}

export class ToolValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly phase: "input" | "output",
    public readonly cause: unknown
  ) {
    super(`Tool "${toolName}" ${phase} validation failed: ${String(cause)}`);
    this.name = "ToolValidationError";
  }
}

export interface ToolDefinition<
  InputSchema extends z.ZodTypeAny,
  OutputSchema extends z.ZodTypeAny
> {
  name: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  handler: (input: z.infer<InputSchema>) => Promise<z.infer<OutputSchema>>;
}

type AnyToolDefinition = ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>;

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();

  register<InputSchema extends z.ZodTypeAny, OutputSchema extends z.ZodTypeAny>(
    definition: ToolDefinition<InputSchema, OutputSchema>
  ): void {
    this.tools.set(definition.name, definition as AnyToolDefinition);
  }

  async call(name: string, rawInput: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new UnknownToolError(name);
    }

    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new ToolValidationError(name, "input", parsedInput.error);
    }

    const rawOutput = await tool.handler(parsedInput.data);

    const parsedOutput = tool.outputSchema.safeParse(rawOutput);
    if (!parsedOutput.success) {
      throw new ToolValidationError(name, "output", parsedOutput.error);
    }

    return parsedOutput.data;
  }
}
