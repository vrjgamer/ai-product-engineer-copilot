export interface ToolCallStep {
  id: string;
  kind: "tool_call";
  tool: string;
  args: unknown;
  dependsOn: string[];
}

export interface GenerateStep {
  id: string;
  kind: "generate";
  section: string;
  dependsOn: string[];
}

export type Step = ToolCallStep | GenerateStep;

export type Plan = Step[];
