"use client";

import { forwardRef } from "react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { useTypewriter } from "./use-typewriter";
import type { DemoStep, StepStatus } from "./script";

const kindLabel: Record<DemoStep["kind"], string> = {
  plan: "plan",
  tool_call: "tool call",
  generate: "generate",
  judge: "judge",
};

interface StepCardProps {
  step: DemoStep;
  status: StepStatus;
}

export const StepCard = forwardRef<HTMLDivElement, StepCardProps>(
  function StepCard({ step, status }, ref) {
    const typed = useTypewriter(step.output, status === "done", 2);

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: status === "pending" ? 0.35 : 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border bg-card p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {kindLabel[step.kind]}
            </Badge>
            <span className="text-sm font-medium">{step.title}</span>
          </div>
          <StatusDot status={status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{step.subtitle}</p>
        {status !== "pending" && (
          <pre className="mt-3 min-h-10 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap">
            {status === "running" ? "…" : typed}
          </pre>
        )}
      </motion.div>
    );
  }
);

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "pending") {
    return <span className="size-2 rounded-full bg-muted-foreground/30" />;
  }
  if (status === "running") {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60" />
        <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
      </span>
    );
  }
  return <span className="size-2 rounded-full bg-emerald-500" />;
}
