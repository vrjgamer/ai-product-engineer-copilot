import { listRecentRuns } from "../lib/results/record";
import HomeClient from "./HomeClient";

// The recent-runs sidebar needs a fresh read on every request, not a list
// frozen at build time — without this, Next.js would statically prerender
// "/" once and every visitor would see whatever the last 30 runs were at
// build time, forever.
export const dynamic = "force-dynamic";

/**
 * Server component so the recent-runs sidebar can be fetched and rendered
 * without a client-side round trip; `HomeClient` owns the actual layout
 * (including whether the sidebar shows at all — hidden once a run starts)
 * since that depends on client-side run status.
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

  return <HomeClient recentRuns={runs} />;
}
