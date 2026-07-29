import { Card } from "@/components/ui/card";

const pillars = [
  {
    title: "Offline eval harness",
    body: "A golden set where every case has an input and a rubric. A regression runner flags any case whose score drops below its recorded baseline — fixed temperature or a fixed seed keeps runs comparable over time.",
  },
  {
    title: "A judge that's checked, not trusted",
    body: "The judge must separate a known-good output from a known-bad one before its verdicts on real cases count. Every pairwise comparison runs forward and swapped — a judge that flips its winner based on position or verbosity fails the check.",
  },
  {
    title: "A failure taxonomy that catches hallucination",
    body: "Every run is tagged with zero or more of hallucination, planning, tool, context — derived from structured signals. A claimed metric that never came back from the analytics MCP server is tagged hallucination by construction, not by asking another model to guess.",
  },
  {
    title: "Observability you can actually query",
    body: "Every step emits a trace with latency, token counts, and cost. A run's total cost is just the sum of its traces, and traces are queryable by failure tag — 'show me every context failure from the last 100 runs' is a query, not a transcript search.",
  },
];

export function RigorLayer() {
  return (
    <section id="rigor-layer" className="border-b bg-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          The rigor layer
        </h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Most agent demos stop at &ldquo;it can call a tool.&rdquo; The
          harder question is how you know an agent is getting better, not
          just different — and how you catch it when it makes something up.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="p-6">
              <h3 className="font-medium">{pillar.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {pillar.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
