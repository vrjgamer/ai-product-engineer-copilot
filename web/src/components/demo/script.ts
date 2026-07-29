// Canned, deterministic content for the simulated demo run. The docs-store
// passage and analytics metric here are the exact fixture values used in the
// real project's tests (src/mcp/mcp.test.ts) — the demo isn't inventing
// data, it's replaying a real, tested run.

export const userRequest =
  "Draft the problem statement for the onboarding redesign — include the current activation rate.";

export type StepStatus = "pending" | "running" | "done";

export type StepKind = "plan" | "tool_call" | "generate" | "judge";

export interface DemoStep {
  id: string;
  kind: StepKind;
  title: string;
  subtitle: string;
  /** Revealed once the step is "done" — typed out character by character. */
  output: string;
}

export const planSteps = [
  "search_docs({ query: \"onboarding\" })",
  "get_metrics({ names: [\"activation_rate\"] })",
  "generate(\"problem_statement\")",
  "judge(\"problem_statement\", rubric)",
];

export const demoSteps: DemoStep[] = [
  {
    id: "tool-docs",
    kind: "tool_call",
    title: "docs-store.search_docs",
    subtitle: "MCP tool call",
    output:
      '[source:onboarding-spec] Onboarding Flow Spec\nThe onboarding flow reduces signup drop-off by front-loading value.',
  },
  {
    id: "tool-analytics",
    kind: "tool_call",
    title: "analytics.get_metrics",
    subtitle: "MCP tool call",
    output: '{ "name": "activation_rate", "value": 0.42, "source": "product-analytics" }',
  },
  {
    id: "generate",
    kind: "generate",
    title: "Generate: problem_statement",
    subtitle: "Folds retrieved context + cited metric into prose",
    output:
      "Problem Statement\nThe onboarding flow reduces signup drop-off by front-loading value. Today, activation rate sits at 42% (source: product-analytics) — the redesign targets pushing this past 55% within two quarters.",
  },
  {
    id: "judge",
    kind: "judge",
    title: "Judge: score against rubric",
    subtitle: "Sanity-anchored, bias-checked",
    output:
      'score: 0.92 — cites a grounded metric (42%, product-analytics) and reflects the retrieved passage directly. No fabricated figures detected.',
  },
];
