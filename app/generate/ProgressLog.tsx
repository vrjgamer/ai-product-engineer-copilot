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
    <section className="card progress" data-testid="progress-log" aria-live={live ? "polite" : "off"}>
      <h2 className="section-title">Run progress</h2>
      {supervisorMessage ? (
        <p className="supervisor-decision" data-testid="supervisor-decision">
          {supervisorMessage}
        </p>
      ) : null}
      <ul className="node-list" data-testid="node-status-list">
        {/*
          `clarificationGate` (TDD 0010) only runs on the minority of runs the
          supervisor decides to pause, so it's listed only once it has
          actually reported — a permanently "pending" row on every
          unclarified run would read as something that got skipped or stuck.
        */}
        {NODE_ORDER.filter(
          (node) => node !== "clarificationGate" || statusByNode.has(node),
        ).map((node) => {
          const status = statusByNode.get(node) ?? "pending";
          return (
            <li className="node-row" key={node} data-testid={`node-status-${node}`} data-status={status}>
              <span className="dot" aria-hidden="true" />
              <span className="node-name">{NODE_LABEL[node]}</span>
              <span className="node-state">{status}</span>
            </li>
          );
        })}
      </ul>
      {mcpCalls.length > 0 ? (
        <ul className="mcp-log" data-testid="mcp-call-log">
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
