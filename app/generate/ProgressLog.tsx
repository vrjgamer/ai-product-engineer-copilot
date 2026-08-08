import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { NODE_LABEL, NODE_ORDER } from "./nodeMeta";

export interface ProgressLogProps {
  events: StreamEvent[];
  live: boolean;
}

/**
 * Live-updating view of the in-progress run (TDD 0005): which node is
 * currently running/completed/errored, the supervisor's routing decision,
 * and a chronological log of MCP tool calls as they happen. Purely derived
 * from `events` — no fetch/state of its own — so it's testable with fixture
 * event arrays.
 */
export function ProgressLog({ events, live }: ProgressLogProps) {
  const statusByNode = new Map<string, "running" | "completed" | "error">();
  let supervisorMessage: string | undefined;
  const mcpCalls: Extract<StreamEvent, { type: "mcp-call" }>[] = [];

  for (const event of events) {
    if (event.type === "node-status") {
      statusByNode.set(event.node, event.status);
      if (event.node === "supervisor" && event.message) supervisorMessage = event.message;
    } else if (event.type === "mcp-call") {
      mcpCalls.push(event);
    }
  }

  return (
    <section data-testid="progress-log" aria-live={live ? "polite" : "off"}>
      {supervisorMessage ? <p data-testid="supervisor-decision">{supervisorMessage}</p> : null}
      <ul data-testid="node-status-list">
        {NODE_ORDER.map((node) => {
          const status = statusByNode.get(node) ?? "pending";
          return (
            <li key={node} data-testid={`node-status-${node}`} data-status={status}>
              {NODE_LABEL[node]}: {status}
            </li>
          );
        })}
      </ul>
      {mcpCalls.length > 0 ? (
        <ul data-testid="mcp-call-log">
          {mcpCalls.map((call, index) => (
            <li key={index} data-testid="mcp-call-entry">
              {NODE_LABEL[call.node]} → {call.tool} ({call.status})
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
