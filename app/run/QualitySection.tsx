import type { RunEvalRecord } from "../../lib/eval/record";
import { RUBRIC_DIMENSIONS } from "../../lib/eval/rubric";

export interface QualitySectionProps {
  /** TDD 0011: present only for runs the eval harness graded — visitor runs aren't judged. */
  evaluation: RunEvalRecord | null;
}

/**
 * The quality judgment (TDD 0011), extracted unchanged from the retired
 * `TraceView` (TDD 0015): it describes the whole run, not one view of it, so
 * it sits below the workspace panel regardless of which tab is selected.
 * Its "this run wasn't scored" state stays exactly as honest as it was.
 */
export function QualitySection({ evaluation }: QualitySectionProps) {
  if (!evaluation) {
    return (
      <p className="trace-unjudged" data-testid="trace-unjudged">
        This run wasn&apos;t scored for quality. Only runs from the golden-set harness
        (<code>npm run eval</code>) are judged — see <code>ARCHITECTURE.md</code> §9.
      </p>
    );
  }

  const { deliverables, missing, tags, overall, judgeModelId } = evaluation.evaluation;

  return (
    <div className="trace-quality" data-testid="trace-quality">
      <h2 className="section-title">Quality judgment</h2>
      <dl className="trace-summary">
        <div className="trace-stat">
          <dt>Overall</dt>
          <dd data-testid="trace-quality-overall">{overall.toFixed(2)} / 5</dd>
        </div>
        <div className="trace-stat">
          <dt>Judge</dt>
          <dd data-testid="trace-quality-judge">{judgeModelId}</dd>
        </div>
        <div className="trace-stat">
          <dt>Golden case</dt>
          <dd data-testid="trace-quality-case">{evaluation.caseId ?? "—"}</dd>
        </div>
        <div className="trace-stat">
          <dt>Failure tags</dt>
          <dd data-testid="trace-quality-tags">{tags.length > 0 ? tags.join(", ") : "none"}</dd>
        </div>
      </dl>
      <div className="table-scroll">
        <table className="trace-table" data-testid="trace-quality-table">
          <thead>
            <tr>
              <th>Deliverable</th>
              <th>Score</th>
              {RUBRIC_DIMENSIONS.map((dimension) => (
                <th key={dimension}>{dimension}</th>
              ))}
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {deliverables.map((entry) => (
              <tr key={entry.deliverable} data-testid={`trace-quality-${entry.deliverable}`}>
                <td>{entry.deliverable}</td>
                <td data-testid={`trace-quality-score-${entry.deliverable}`}>
                  {entry.score.toFixed(2)}
                </td>
                {RUBRIC_DIMENSIONS.map((dimension) => (
                  <td key={dimension}>{entry.judgment.scores[dimension]}</td>
                ))}
                <td data-testid={`trace-quality-tags-${entry.deliverable}`}>
                  {entry.judgment.tags.length > 0 ? entry.judgment.tags.join(", ") : "—"}
                </td>
              </tr>
            ))}
            {missing.map((deliverable) => (
              <tr key={deliverable} data-testid={`trace-quality-missing-${deliverable}`}>
                <td>{deliverable}</td>
                {/* Not scored 1/5 — an unwritten document is an availability
                    failure, already visible in the node table above. */}
                <td colSpan={RUBRIC_DIMENSIONS.length + 2}>not produced by this run</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
