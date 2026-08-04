import { Annotation } from "@langchain/langgraph";

export interface PrdOutput {
  content: string;
}

export interface UserStoryOutput {
  content: string;
}

export interface ArchitectureReviewOutput {
  content: string;
}

export interface ExperimentDesignOutput {
  content: string;
}

export interface RoadmapOutput {
  content: string;
}

export interface NodeError {
  node: string;
  message: string;
}

export interface AssembledResult {
  prd: PrdOutput | null;
  userStories: UserStoryOutput | null;
  architectureReview: ArchitectureReviewOutput | null;
  experimentDesign: ExperimentDesignOutput | null;
  roadmap: RoadmapOutput | null;
  errors: NodeError[];
}

const overwrite = <T>() => ({
  reducer: (_current: T, update: T) => update,
  default: (): T | null => null,
});

/**
 * `errors` uses a concat reducer because the three fan-out nodes can each
 * write an entry in the same superstep — a last-value reducer would throw on
 * concurrent writes to the same key.
 */
export const GraphAnnotation = Annotation.Root({
  request: Annotation<string>,
  prd: Annotation<PrdOutput | null>(overwrite<PrdOutput | null>()),
  userStories: Annotation<UserStoryOutput | null>(overwrite<UserStoryOutput | null>()),
  architectureReview: Annotation<ArchitectureReviewOutput | null>(
    overwrite<ArchitectureReviewOutput | null>(),
  ),
  experimentDesign: Annotation<ExperimentDesignOutput | null>(
    overwrite<ExperimentDesignOutput | null>(),
  ),
  roadmap: Annotation<RoadmapOutput | null>(overwrite<RoadmapOutput | null>()),
  errors: Annotation<NodeError[]>({
    reducer: (current: NodeError[], update: NodeError[]) => current.concat(update),
    default: () => [],
  }),
  result: Annotation<AssembledResult | null>(overwrite<AssembledResult | null>()),
});

export type GraphState = typeof GraphAnnotation.State;
export type GraphStateUpdate = typeof GraphAnnotation.Update;
