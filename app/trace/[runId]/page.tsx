import { redirect } from "next/navigation";

interface TracePageProps {
  params: Promise<{ runId: string }>;
}

/**
 * TDD 0015: `/trace/[runId]` is retired into `/run/[runId]`'s Graph tab —
 * once the workspace panel holds both the deliverables and the graph behind
 * one tab strip, two separate pages for the same run is the live UX
 * contradicting itself. This redirects rather than 404ing because trace
 * links have already been handed out, and 0012's whole argument was that a
 * run's URL should keep working.
 */
export default async function TracePage({ params }: TracePageProps) {
  const { runId } = await params;
  redirect(`/run/${runId}`);
}
