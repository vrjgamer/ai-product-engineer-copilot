import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDocsStoreServer } from "./docs-store-server.js";
import { createAnalyticsServer } from "./analytics-server.js";
import { McpToolClient, type McpLogger } from "./client.js";
import { assembleDocsContext, citeMetric } from "./assemble.js";

function makeLogger(): McpLogger & { calls: Array<[string, string, unknown]> } {
  const calls: Array<[string, string, unknown]> = [];
  return {
    calls,
    logToolFailure(serverName, toolName, error) {
      calls.push([serverName, toolName, error]);
    },
  };
}

async function connectedDocsStoreClient(logger: McpLogger) {
  const server = createDocsStoreServer([
    {
      id: "onboarding-spec",
      title: "Onboarding Flow Spec",
      content: "The onboarding flow reduces signup drop-off by front-loading value.",
    },
    {
      id: "billing-spec",
      title: "Billing Spec",
      content: "Billing supports monthly and annual plans.",
    },
  ]);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const rawClient = new Client({ name: "docs-store-client", version: "0.1.0" });
  await server.connect(serverTransport);
  const client = new McpToolClient("docs-store", rawClient, logger);
  await client.connect(clientTransport);
  return client;
}

async function connectedAnalyticsClient(logger: McpLogger) {
  const server = createAnalyticsServer([
    { name: "activation_rate", value: 0.42, source: "product-analytics" },
    { name: "weekly_actives", value: 18234, source: "product-analytics" },
  ]);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const rawClient = new Client({ name: "analytics-client", version: "0.1.0" });
  await server.connect(serverTransport);
  const client = new McpToolClient("analytics", rawClient, logger);
  await client.connect(clientTransport);
  return client;
}

describe("docs-store MCP", () => {
  it("returns retrievable context that the agent folds into its output", async () => {
    const logger = makeLogger();
    const client = await connectedDocsStoreClient(logger);

    const result = await client.callTool("search_docs", { query: "onboarding" });
    const passages = assembleDocsContext(result);

    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]).toContain("source:onboarding-spec");

    // Simulate the agent assembling a section from retrieved context.
    const generatedSection = `Problem Statement\n${passages.join("\n")}`;
    expect(generatedSection).toContain("front-loading value");
  });
});

describe("analytics MCP", () => {
  it("returns metrics that the agent cites, and never invents a metric it wasn't given", async () => {
    const logger = makeLogger();
    const client = await connectedAnalyticsClient(logger);

    const result = await client.callTool("get_metrics", { names: ["activation_rate"] });

    const cited = citeMetric(result, "activation_rate");
    expect(cited).toEqual({
      name: "activation_rate",
      value: 0.42,
      source: "product-analytics",
    });

    // A metric the server never returned must not be citable — the agent has
    // nothing to fabricate a number from.
    const notReturned = citeMetric(result, "weekly_actives");
    expect(notReturned).toBeNull();
  });
});

describe("MCP unreachable", () => {
  it("degrades gracefully and logs the failure instead of crashing", async () => {
    const logger = makeLogger();
    const rawClient = new Client({ name: "analytics-client", version: "0.1.0" });
    // Never connected — simulates the server being unreachable.
    const client = new McpToolClient("analytics", rawClient, logger);

    const result = await client.callTool("get_metrics", { names: ["activation_rate"] });

    expect(result.ok).toBe(false);
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0][0]).toBe("analytics");

    // Degraded result must not be citable as a real metric either.
    expect(citeMetric(result, "activation_rate")).toBeNull();
  });
});
