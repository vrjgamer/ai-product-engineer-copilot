import { listRecentRuns } from "../lib/results/record";
import HomeClient from "./HomeClient";
import { RecentRunsSidebar } from "./RecentRunsSidebar";

// The recent-runs sidebar needs a fresh read on every request, not a list
// frozen at build time — without this, Next.js would statically prerender
// "/" once and every visitor would see whatever the last 30 runs were at
// build time, forever.
export const dynamic = "force-dynamic";

/**
 * Server component so the recent-runs sidebar can be fetched and rendered
 * without a client-side round trip; the interactive composer/thread/graph
 * experience is `HomeClient` (a plain sibling here, not a child prop — it
 * owns its own network calls once mounted).
 */
export default async function Home() {
  // Best-effort, same as the trace/result writes elsewhere (TDD 0007/0012):
  // the sidebar is a nice-to-have, and the demo's actual point — describing
  // a product and getting a plan — has no DB dependency at all. A DB hiccup
  // here shouldn't take down the whole landing page, just show it empty.
  const runs = await listRecentRuns(30).catch((error: unknown) => {
    console.error("Failed to list recent runs", error);
    return [];
  });

  return (
    <div className="home-shell">
      <RecentRunsSidebar runs={runs} />
      <HomeClient />
    </div>
  );
}
