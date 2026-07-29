export const links = {
  repo: "https://github.com/vrjgamer/ai-product-engineer-copilot",
  mcpToolkit: "https://github.com/vrjgamer/mcp-toolkit",
  evalFramework: "https://github.com/vrjgamer/agent-eval-framework",
  architectureDoc:
    "https://github.com/vrjgamer/ai-product-engineer-copilot/blob/main/ARCHITECTURE.md",
};

export interface Phase {
  number: number;
  title: string;
  summary: string;
  details: string[];
  status: "done" | "planned";
  link?: { label: string; href: string };
}

export const phases: Phase[] = [
  {
    number: 0,
    title: "Architecture doc",
    summary:
      "Agent loop design, memory model, MCP boundary, eval strategy, observability schema — and the alternatives rejected, with reasons.",
    details: [
      "Plan-then-execute vs. ReAct, decided before any code existed",
      "Two-tier memory model: ephemeral session context + scoped, invalidatable persistent memory",
      "MCP as the only path to external systems — zero direct SDK calls from the agent core",
    ],
    status: "done",
    link: { label: "Read ARCHITECTURE.md", href: "https://github.com/vrjgamer/ai-product-engineer-copilot/blob/main/ARCHITECTURE.md" },
  },
  {
    number: 1,
    title: "Typed tool-calling core",
    summary:
      "A tool registry that validates every call against a schema. Malformed output is rejected, not coerced; unknown tools fail loudly.",
    details: [
      "Zod-validated input and output on every registered tool",
      "A tool call with a valid schema returns a parsed, type-safe result",
      "Extracted into the standalone mcp-toolkit package",
    ],
    status: "done",
  },
  {
    number: 2,
    title: "Multi-step planning loop",
    summary:
      "The planner emits an ordered step list before anything executes. A failed step triggers a bounded replan — it never proceeds on stale state.",
    details: [
      "Planner and executor are fully separate — planning never has side effects",
      "Failed steps discard the stale remaining queue and replan around them",
      "A max-step guard stops runaway plans before they start",
    ],
    status: "done",
  },
  {
    number: 3,
    title: "MCP integrations",
    summary:
      "Two MCP servers — docs-store and analytics — wired through a client that degrades gracefully instead of crashing or inventing data.",
    details: [
      "Retrieved docs-store passages are folded directly into generated output",
      "Analytics metrics are cited, never fabricated — nothing to invent if the server didn't return it",
      "An unreachable MCP server logs a typed failure and lets the run continue",
    ],
    status: "done",
  },
  {
    number: 4,
    title: "Persistent memory",
    summary:
      "Facts survive across sessions, scoped strictly per user/project, with explicit — not TTL-based — invalidation.",
    details: [
      "A fact written in one session is retrievable in the next",
      "Memory is keyed by (userId, projectId) only — no cross-leak between projects",
      "Invalidation is an explicit, timestamped, auditable event",
    ],
    status: "done",
  },
  {
    number: 5,
    title: "The rigor layer",
    summary:
      "An offline eval harness, a bias-checked LLM judge, a four-tag failure taxonomy, and per-step observability — the part most agent demos skip.",
    details: [
      "Golden-set regression runner flags any case that drops below its baseline",
      "The judge must pass sanity anchors before its verdicts on real cases are trusted",
      "Position/verbosity bias check: swapping A/B order shouldn't flip the winner",
      "A fabricated analytics number is caught and tagged as hallucination, by construction",
      "Every step emits a trace with latency, token cost, and failure tags — a run's total cost is just the sum",
    ],
    status: "done",
  },
  {
    number: 6,
    title: "Extraction for open source",
    summary:
      "The reusable seams were extracted into two standalone, MIT-licensed packages — a real extraction, not a rewrite, because the seams were designed in from Phase 3 onward.",
    details: [
      "mcp-toolkit — the typed tool registry, MCP client wrapper, and observability tracing",
      "agent-eval-framework — the golden-set harness, judge, bias checks, and failure taxonomy",
    ],
    status: "done",
    link: { label: "Both packages ↓", href: "#packages" },
  },
];

export interface ExtractedPackage {
  name: string;
  tagline: string;
  description: string;
  href: string;
  install: string;
}

export const packages: ExtractedPackage[] = [
  {
    name: "mcp-toolkit",
    tagline: "Typed tools, safe MCP calls, per-step tracing",
    description:
      "A typed tool registry with schema validation, an MCP client wrapper that turns an unreachable server into a logged, typed failure instead of a crash, and observability primitives (StepTrace, TraceStore) queryable by any failure-tag vocabulary you bring.",
    href: "https://github.com/vrjgamer/mcp-toolkit",
    install: "npm install github:vrjgamer/mcp-toolkit",
  },
  {
    name: "agent-eval-framework",
    tagline: "Golden sets, a judge you can actually trust, a failure taxonomy",
    description:
      "An offline golden-set eval harness with a regression runner, an LLM-as-judge with sanity anchors and position/verbosity bias checks, and a four-tag failure taxonomy that catches a fabricated metric by construction.",
    href: "https://github.com/vrjgamer/agent-eval-framework",
    install: "npm install github:vrjgamer/agent-eval-framework",
  },
];

export const stack = [
  "TypeScript",
  "Node.js",
  "MCP",
  "Zod",
  "Vitest",
  "Anthropic API (Claude)",
];
