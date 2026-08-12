import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DELIVERABLE_NAMES, SCORE_MAX, SCORE_MIN, type DeliverableName } from "./rubric";

/** One deterministic, model-free check: this deliverable must mention all of these. */
export interface Expectation {
  deliverable: DeliverableName;
  mustMention: string[];
}

/**
 * A request the harness actually runs the graph on, plus the checks that
 * don't need a judge. The deterministic layer exists because an LLM judge is
 * a noisy instrument: "did the roadmap mention the compliance deadline the
 * request stated" is a fact, and facts shouldn't be delegated to a grader
 * that can be talked out of them.
 */
export interface GoldenCase {
  id: string;
  request: string;
  /** Why this case is in the set — printed in the report so a failure is diagnosable without reading this file. */
  rationale: string;
  expectations: Expectation[];
}

/**
 * A fixed document with a known verdict, used to check the *judge* rather
 * than the system. `bad` cases catch leniency (a judge that awards 4s to
 * anything); `good` cases catch severity (one that awards 2s to anything).
 * Without these, a suite average is unfalsifiable — it moves when the judge
 * drifts and you can't tell that from the product changing.
 */
export interface ControlCase {
  id: string;
  control: "good" | "bad";
  request: string;
  deliverable: DeliverableName;
  content: string;
  rationale: string;
  /** `good` controls set a floor, `bad` controls set a ceiling, on the judged mean score. */
  expectedScoreMin?: number;
  expectedScoreMax?: number;
}

export interface GoldenSet {
  cases: GoldenCase[];
  controls: ControlCase[];
}

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eval", "golden");

/**
 * Reads the committed golden set. Parsing is strict and throws on anything
 * malformed: a silently-dropped case would shrink the suite without
 * shrinking its reported pass rate, which is the one failure mode a
 * regression gate must never have.
 */
export async function loadGoldenSet(dir: string = GOLDEN_DIR): Promise<GoldenSet> {
  const [cases, controls] = await Promise.all([
    readJson(join(dir, "cases.json")),
    readJson(join(dir, "controls.json")),
  ]);

  return {
    cases: parseGoldenCases(cases),
    controls: parseControlCases(controls),
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(`Could not read golden set file ${path}: ${describe(error)}`);
  }
}

export function parseGoldenCases(value: unknown): GoldenCase[] {
  const entries = asArray(value, "cases.json");
  const cases = entries.map((entry, index) => parseGoldenCase(entry, `cases.json[${index}]`));
  assertUniqueIds(cases.map((entry) => entry.id));
  return cases;
}

export function parseControlCases(value: unknown): ControlCase[] {
  const entries = asArray(value, "controls.json");
  const controls = entries.map((entry, index) => parseControlCase(entry, `controls.json[${index}]`));
  assertUniqueIds(controls.map((entry) => entry.id));
  return controls;
}

function parseGoldenCase(value: unknown, where: string): GoldenCase {
  const record = asRecord(value, where);

  return {
    id: requireString(record.id, `${where}.id`),
    request: requireString(record.request, `${where}.request`),
    rationale: requireString(record.rationale, `${where}.rationale`),
    expectations: asArray(record.expectations, `${where}.expectations`).map(
      (expectation, index) => parseExpectation(expectation, `${where}.expectations[${index}]`),
    ),
  };
}

function parseExpectation(value: unknown, where: string): Expectation {
  const record = asRecord(value, where);
  const mustMention = asArray(record.mustMention, `${where}.mustMention`).map((entry, index) =>
    requireString(entry, `${where}.mustMention[${index}]`),
  );

  if (mustMention.length === 0) {
    throw new Error(`${where}.mustMention must list at least one string — an empty check always passes.`);
  }

  return { deliverable: requireDeliverable(record.deliverable, `${where}.deliverable`), mustMention };
}

function parseControlCase(value: unknown, where: string): ControlCase {
  const record = asRecord(value, where);
  const control = record.control;
  if (control !== "good" && control !== "bad") {
    throw new Error(`${where}.control must be "good" or "bad", got ${JSON.stringify(control)}.`);
  }

  const parsed: ControlCase = {
    id: requireString(record.id, `${where}.id`),
    control,
    request: requireString(record.request, `${where}.request`),
    deliverable: requireDeliverable(record.deliverable, `${where}.deliverable`),
    content: requireString(record.content, `${where}.content`),
    rationale: requireString(record.rationale, `${where}.rationale`),
    ...(record.expectedScoreMin !== undefined
      ? { expectedScoreMin: requireScore(record.expectedScoreMin, `${where}.expectedScoreMin`) }
      : {}),
    ...(record.expectedScoreMax !== undefined
      ? { expectedScoreMax: requireScore(record.expectedScoreMax, `${where}.expectedScoreMax`) }
      : {}),
  };

  const bound = control === "good" ? parsed.expectedScoreMin : parsed.expectedScoreMax;
  if (bound === undefined) {
    throw new Error(
      `${where} is a "${control}" control but sets no ` +
        `${control === "good" ? "expectedScoreMin" : "expectedScoreMax"} — it would assert nothing.`,
    );
  }

  return parsed;
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where} must be an array.`);
  return value;
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${where} must be a non-empty string.`);
  }
  return value;
}

function requireDeliverable(value: unknown, where: string): DeliverableName {
  if (!DELIVERABLE_NAMES.includes(value as DeliverableName)) {
    throw new Error(
      `${where} must be one of ${DELIVERABLE_NAMES.join(", ")}, got ${JSON.stringify(value)}.`,
    );
  }
  return value as DeliverableName;
}

function requireScore(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < SCORE_MIN || value > SCORE_MAX) {
    throw new Error(`${where} must be a number between ${SCORE_MIN} and ${SCORE_MAX}.`);
  }
  return value;
}

function assertUniqueIds(ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate golden set id "${id}" — ids key the baseline.`);
    seen.add(id);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
