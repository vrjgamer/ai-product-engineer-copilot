import { Card } from "@/components/ui/card";

const steps = [
  {
    label: "Planner",
    detail: "Emits an ordered, typed step list before anything runs",
  },
  {
    label: "Executor",
    detail: "Runs each step through the tool registry; catches failures",
  },
  {
    label: "Replan",
    detail: "On failure, discards the stale queue and plans around it",
  },
  {
    label: "Assembler",
    detail: "Folds retrieved context and results into the final document",
  },
];

export function AgentLoop() {
  return (
    <section className="border-b bg-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Plan-then-execute, not ReAct
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The agent produces an explicit, ordered plan before anything
          executes, instead of interleaving reasoning and tool calls one step
          at a time. That single decision is what makes replanning,
          per-step observability, and a failure taxonomy well-defined —
          none of it means much against a transcript where the plan only
          exists implicitly.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Card key={step.label} className="relative p-5">
              <span className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-medium">{step.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {step.detail}
              </p>
            </Card>
          ))}
        </div>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          replan(remaining, failure, context) → new steps — the stale queue
          is never executed.
        </p>
      </div>
    </section>
  );
}
