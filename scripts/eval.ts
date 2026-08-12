/**
 * The golden-set regression harness (TDD 0011, ARCHITECTURE.md §9) — the
 * third test mode, next to the mocked `npm test` and the real-API
 * `npm run test:e2e`. Manually invoked, never in CI: it makes real model
 * calls (one graph run plus five judge calls per case), so putting it on
 * every push would mean secrets and spend in CI, which §8 decided against.
 *
 *   DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-... npm run eval
 *   npm run eval -- --update-baseline    # snapshot a passing suite
 *
 * Exits non-zero when the gate fails, so it can be wired into a deploy
 * script. Requires migrations to have been applied (`npx tsx
 * scripts/migrate.ts`) — each case's run writes a real trace row and a real
 * `run_evals` row, which is what makes `/trace/<runId>` show the score.
 */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "@langchain/langgraph";

import { getCheckpointer } from "../lib/db/checkpointer";
import { runExpectations } from "../lib/eval/checks";
import { checkCalibration } from "../lib/eval/calibration";
import { buildBaseline, evaluateGate, type Baseline, type CaseResult, type SuiteResult } from "../lib/eval/gate";
import { loadGoldenSet, type GoldenCase } from "../lib/eval/goldenSet";
import { judgeRun } from "../lib/eval/judge";
import { getJudgeModelConfig } from "../lib/eval/judgeModel";
import { recordRunEval } from "../lib/eval/record";
import { formatSuiteReport } from "../lib/eval/report";
import { buildGraph } from "../lib/graph/index";
import type { AssembledResult } from "../lib/graph/state";
import { getModelConfig } from "../lib/models/provider";
import { withRunTracing } from "../lib/tracing/collect";
import { computeTotalCostUsd, getPricing } from "../lib/tracing/pricing";
import { recordRunTrace } from "../lib/tracing/record";

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "eval", "baseline.json");

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL to run the eval harness (it records a trace and a score per case).");
}

const updateBaseline = process.argv.includes("--update-baseline");
const { cases, controls } = await loadGoldenSet();

// Calibration first, and fatally: if the judge can't tell the control
// documents apart, running the graph over the golden set would spend real
// money producing numbers nobody should act on.
console.log(`Calibrating ${getJudgeModelConfig().modelId} against ${controls.length} control document(s)...`);
const calibration = await checkCalibration(controls);

if (!calibration.passed) {
  const emptySuite: SuiteResult = {
    cases: [],
    calibration,
    judgeModelId: getJudgeModelConfig().modelId,
    costUsd: calibration.costUsd,
  };
  console.log(formatSuiteReport(emptySuite, evaluateGate(emptySuite, null)));
  process.exit(1);
}

const results: CaseResult[] = [];
let costUsd = calibration.costUsd;

// Sequentially on purpose: five concurrent graph runs would race the model
// provider's rate limits, and a harness that fails on 429s teaches you
// nothing about quality.
for (const goldenCase of cases) {
  console.log(`Running case "${goldenCase.id}"...`);
  const { result, runId, clarificationSkipped, runCostUsd } = await runCase(goldenCase);
  costUsd += runCostUsd;

  const evaluation = await judgeRun(goldenCase.request, result);
  costUsd += evaluation.costUsd;

  await recordRunEval({
    runId,
    caseId: goldenCase.id,
    judgedAt: new Date().toISOString(),
    evaluation,
  });

  results.push({
    caseId: goldenCase.id,
    runId,
    evaluation,
    expectations: runExpectations(goldenCase, result),
    ...(clarificationSkipped ? { clarificationSkipped } : {}),
  });
}

const suite: SuiteResult = {
  cases: results,
  calibration,
  judgeModelId: getJudgeModelConfig().modelId,
  costUsd,
};

const baseline = await readBaseline();
const verdict = evaluateGate(suite, baseline);

console.log("");
console.log(formatSuiteReport(suite, verdict));

if (updateBaseline) {
  if (!verdict.passed) {
    // Recording a failing suite would launder a regression into the
    // baseline, which is the one thing a regression gate must not allow.
    console.error("\nRefusing to update the baseline from a failing suite.");
    process.exit(1);
  }
  await writeFile(BASELINE_PATH, `${JSON.stringify(buildBaseline(suite, new Date().toISOString()), null, 2)}\n`);
  console.log(`\nBaseline written to ${BASELINE_PATH} — commit it.`);
}

process.exit(verdict.passed ? 0 : 1);

interface CaseRun {
  result: AssembledResult;
  runId: string;
  clarificationSkipped: boolean;
  runCostUsd: number;
}

/**
 * One golden case = one real graph run, traced exactly the way a visitor's
 * run is (TDD 0007), so the harness's runs are inspectable at
 * `/trace/<runId>` like any other.
 *
 * A case that trips the clarification gate (TDD 0010) is resumed with empty
 * answers rather than being fed canned ones: golden requests are written to
 * be specific enough not to pause, so a pause is itself a signal, and
 * answering it here would hide that while also grading a request the case
 * file doesn't contain.
 */
async function runCase(goldenCase: GoldenCase): Promise<CaseRun> {
  const runId = randomUUID();
  const config = { configurable: { thread_id: runId } };
  const graph = buildGraph({ checkpointer: getCheckpointer() });
  const startedAt = new Date();

  const { result: run, nodes } = await withRunTracing(async () => {
    const first = await graph.invoke({ request: goldenCase.request }, config);
    const interrupts = (first as { __interrupt__?: unknown[] }).__interrupt__;
    if (!interrupts || interrupts.length === 0) return { state: first, clarificationSkipped: false };

    console.log(`  (case "${goldenCase.id}" paused for clarifying questions — skipping them)`);
    const resumed = await graph.invoke(new Command({ resume: [] }), config);
    return { state: resumed, clarificationSkipped: true };
  });

  const { provider, modelId } = getModelConfig();
  const runCostUsd = computeTotalCostUsd(nodes, getPricing(provider, modelId));

  await recordRunTrace({
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    nodes,
    totalCostUsd: runCostUsd,
  });

  const result = (run.state as { result?: AssembledResult }).result;
  if (!result) {
    throw new Error(`Case "${goldenCase.id}" completed without producing a result.`);
  }

  return { result, runId, clarificationSkipped: run.clarificationSkipped, runCostUsd };
}

async function readBaseline(): Promise<Baseline | null> {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, "utf-8")) as Baseline;
  } catch {
    return null;
  }
}
