import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { links } from "@/lib/content";
import { DemoStage } from "@/components/demo/demo-stage";

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-5xl flex-1 px-6 py-16">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3 font-mono text-xs">
            Simulated run — no live model call
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Watch the agent work
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            A scripted walkthrough of the planner, the two MCP tool calls,
            generation, and the judge. The two tool call outputs are the
            exact fixture data from the project&apos;s own tests — every
            figure the generated text and the judge reference traces back to
            one of them, nothing asserted without a source.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            ← Overview
          </Link>
          <Link
            href={links.repo}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            View the code ↗
          </Link>
        </div>
      </div>

      <DemoStage />

      <p className="mt-10 text-sm text-muted-foreground">
        Once a live model endpoint is wired in, this same layout runs a real
        planner/executor loop instead of a script.
      </p>
    </div>
  );
}
