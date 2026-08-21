import type { ProgressEvent } from "./progress";
import type { AssembledResult } from "./state";

/**
 * The wire-level event union `app/api/generate/route.ts` streams and
 * `lib/client/parseProgressStream.ts` decodes: `ProgressEvent`s while the
 * run is in flight, plus the run's terminal outcome (`result` on success,
 * `fatal-error` if the run itself couldn't be started/finished — distinct
 * from `state.errors`, which are per-node degradations the run survives).
 * `result`'s `runId` (TDD 0007) is the same ID used as the checkpointer's
 * thread_id and the trace's `run_id` — it's what the UI's "view trace" link
 * points at.
 *
 * A run can also end a leg without a result: `clarification-request` (TDD
 * 0010) means the graph paused at `clarificationGate` and is waiting on
 * answers, and `prd-approval-request` means it paused at `prdApprovalGate`
 * waiting on approval (or revision feedback) for the drafted PRD. Both carry
 * `runId` — the thread the client posts its response back against — for the
 * same reason `result` does.
 */
export type StreamEvent =
  | ProgressEvent
  | { type: "result"; result: AssembledResult; runId: string }
  | { type: "clarification-request"; runId: string; questions: string[] }
  | { type: "prd-approval-request"; runId: string; prd: string }
  | { type: "fatal-error"; message: string };

/**
 * Every `StreamEvent` is written as the `data` of this one custom UI-message
 * data part (Vercel AI SDK data-stream protocol, `ai`'s `data-${name}` part
 * convention) — a single channel is simpler for the client to filter for
 * than one part type per event kind.
 */
export const PROGRESS_CHUNK_TYPE = "data-progress" as const;
