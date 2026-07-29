import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stack, links } from "@/lib/content";

export function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <Badge variant="secondary" className="mb-6 font-mono text-xs">
          Built test-first, phase by phase
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          AI Product Engineer Copilot
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A multi-step agent that generates PRDs, user stories, experiment
          designs, and roadmaps — built around the parts most agent demos
          skip: typed tool-calling, MCP integrations that degrade gracefully,
          persistent memory, and a full eval/observability rigor layer that
          checks its own judge for bias.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href={links.repo}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            View the code ↗
          </Link>
          <Link href="#rigor-layer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            See the rigor layer
          </Link>
          <Link href="/demo" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Live demo (coming soon)
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          {stack.map((item) => (
            <Badge key={item} variant="outline" className="font-mono text-xs">
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
