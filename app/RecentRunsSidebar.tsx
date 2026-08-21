import type { RunSummary } from "../lib/results/record";

export interface RecentRunsSidebarProps {
  runs: RunSummary[];
}

/**
 * The last 30 runs anyone has generated (server-rendered, `app/page.tsx`
 * fetches via `listRecentRuns`), each opening its permalink in a new tab —
 * this is the demo's own history, not "your" history: there are no accounts
 * to scope it to. A deliberate reversal of TDD 0012's "the URL is the
 * capability, nothing enumerates run IDs" stance — see `listRecentRuns`'s
 * doc comment for the tradeoff.
 */
export function RecentRunsSidebar({ runs }: RecentRunsSidebarProps) {
  return (
    <aside className="recent-runs" data-testid="recent-runs-sidebar">
      <h2 className="section-title">Recent runs</h2>
      {runs.length === 0 ? (
        <p className="recent-runs-empty" data-testid="recent-runs-empty">
          No runs yet — be the first.
        </p>
      ) : (
        <ul className="recent-runs-list">
          {runs.map((run) => (
            <li key={run.runId}>
              <a
                className="recent-run-link"
                href={`/run/${run.runId}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="recent-run-link"
              >
                <span className="recent-run-request">{run.request}</span>
                <span className="recent-run-meta">{formatRelativeTime(run.createdAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Coarse, server-render-friendly relative time — this list is re-fetched on every page load, so it doesn't need to tick live. */
function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
