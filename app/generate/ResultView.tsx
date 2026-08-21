"use client";

import "github-markdown-css/github-markdown.css";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AssembledResult } from "../../lib/graph/state";

type SectionKey = "prd" | "userStories" | "architectureReview" | "experimentDesign" | "roadmap";

const SECTIONS: { key: SectionKey; node: string; title: string }[] = [
  { key: "prd", node: "prdAgent", title: "PRD" },
  { key: "userStories", node: "userStoryAgent", title: "User Stories" },
  { key: "architectureReview", node: "architectureReviewAgent", title: "Architecture Review" },
  { key: "experimentDesign", node: "experimentDesignAgent", title: "Experiment Design" },
  { key: "roadmap", node: "roadmapAgent", title: "Roadmap" },
];

export interface ResultViewProps {
  result: AssembledResult;
}

/**
 * The five deliverables as tabs. A section whose node recorded an
 * `errors` entry (TDD 0002's graceful-degradation contract) is marked
 * degraded rather than hidden; a section with no content at all (the node's
 * own model call, not just its MCP tool call, failed) shows an explicit
 * unavailable note instead of rendering blank.
 */
export function ResultView({ result }: ResultViewProps) {
  const firstAvailable = SECTIONS.find((section) => result[section.key] !== null)?.key ?? SECTIONS[0].key;
  const [selected, setSelected] = useState<SectionKey>(firstAvailable);
  const erroredNodes = new Set(result.errors.map((error) => error.node));

  return (
    <section className="card result" data-testid="result-view">
      <div className="tablist" role="tablist" data-testid="result-tabs">
        {SECTIONS.map((section) => {
          const degraded = erroredNodes.has(section.node);
          return (
            <button
              key={section.key}
              className="tab"
              role="tab"
              type="button"
              aria-selected={selected === section.key}
              data-testid={`tab-${section.key}`}
              data-degraded={degraded}
              onClick={() => setSelected(section.key)}
            >
              {section.title}
              {degraded ? " ⚠" : ""}
            </button>
          );
        })}
      </div>
      {SECTIONS.map((section) => {
        if (selected !== section.key) return null;
        const content = result[section.key];
        const errorMessage = result.errors.find((error) => error.node === section.node)?.message;
        return (
          <div className="panel" key={section.key} role="tabpanel" data-testid={`panel-${section.key}`}>
            {content ? (
              <div className="markdown-body" data-testid={`content-${section.key}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="unavailable" data-testid={`unavailable-${section.key}`}>
                This section is unavailable{errorMessage ? ` — ${errorMessage}` : ""}.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
