import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { links } from "@/lib/content";

export default function DemoPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <Card className="w-full p-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Live demo — coming soon
        </h1>
        <p className="mt-4 text-muted-foreground">
          This page is reserved for an interactive run: submit a PRD request
          and watch the planner, executor, and MCP tool calls happen in real
          time, backed by a real model endpoint instead of the deterministic
          fixtures the test suite uses.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Until then, everything on the main page is real, tested, working
          code — just not wired to a live model call from this site yet.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonVariants()}>
            Back to the overview
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
      </Card>
    </div>
  );
}
