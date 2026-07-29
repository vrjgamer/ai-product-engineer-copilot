"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { FakeCursor } from "./fake-cursor";
import { StepCard } from "./step-card";
import { demoSteps, planSteps, userRequest, type StepStatus } from "./script";

type Phase = "typing" | "sent" | "planning" | "running" | "assembled";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function DemoStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const resultRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("typing");
  const [typedRequest, setTypedRequest] = useState("");
  const [revealedPlanLines, setRevealedPlanLines] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(
    () => Object.fromEntries(demoSteps.map((s) => [s.id, "pending"]))
  );
  const [cursor, setCursor] = useState({ x: 0, y: 0, clicking: false, visible: false });

  useEffect(() => {
    let cancelled = false;

    function moveCursorTo(el: HTMLElement | null) {
      const container = containerRef.current;
      if (!el || !container) return;
      const target = el.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      setCursor((c) => ({
        ...c,
        visible: true,
        x: target.left - box.left + target.width / 2 - 8,
        y: target.top - box.top + target.height / 2 - 6,
      }));
    }

    async function click(el: HTMLElement | null) {
      moveCursorTo(el);
      await sleep(350);
      if (cancelled) return;
      setCursor((c) => ({ ...c, clicking: true }));
      await sleep(250);
      if (cancelled) return;
      setCursor((c) => ({ ...c, clicking: false }));
    }

    async function run() {
      while (!cancelled) {
        // Reset for a fresh loop.
        setPhase("typing");
        setTypedRequest("");
        setRevealedPlanLines(0);
        setStepStatuses(Object.fromEntries(demoSteps.map((s) => [s.id, "pending"])));
        await sleep(700);
        if (cancelled) return;

        moveCursorTo(inputRef.current);
        await sleep(500);

        for (let i = 1; i <= userRequest.length && !cancelled; i += 2) {
          setTypedRequest(userRequest.slice(0, i));
          await sleep(16);
        }
        if (cancelled) return;

        await sleep(400);
        await click(sendButtonRef.current);
        if (cancelled) return;
        setPhase("sent");
        await sleep(500);

        setPhase("planning");
        moveCursorTo(planRef.current);
        for (let i = 1; i <= planSteps.length && !cancelled; i++) {
          setRevealedPlanLines(i);
          await sleep(350);
        }
        if (cancelled) return;

        await sleep(400);
        setPhase("running");

        for (const step of demoSteps) {
          if (cancelled) return;
          moveCursorTo(stepRefs.current[step.id]);
          await sleep(300);
          setStepStatuses((s) => ({ ...s, [step.id]: "running" }));
          await sleep(650);
          if (cancelled) return;
          setStepStatuses((s) => ({ ...s, [step.id]: "done" }));
          await sleep(step.output.length * 9 + 500);
        }
        if (cancelled) return;

        await sleep(400);
        moveCursorTo(resultRef.current);
        setPhase("assembled");
        await sleep(5500);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const assembled = phase === "assembled";

  return (
    <div ref={containerRef} className="relative">
      <FakeCursor x={cursor.x} y={cursor.y} clicking={cursor.clicking} visible={cursor.visible} />

      <div className="grid gap-6 md:grid-cols-[360px_1fr]">
        {/* Chat panel */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                agent-console
              </span>
            </div>
            <div className="min-h-24 space-y-2 p-3">
              <AnimatePresence>
                {phase !== "typing" && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground"
                  >
                    {userRequest}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="border-t p-3">
              <div
                ref={inputRef}
                className="flex h-9 items-center rounded-md border bg-background px-3 font-mono text-xs text-muted-foreground"
              >
                {phase === "typing" ? (
                  <>
                    {typedRequest}
                    <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-foreground" />
                  </>
                ) : (
                  "Message the copilot…"
                )}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  ref={sendButtonRef}
                  type="button"
                  disabled
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-90"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Plan */}
          <div ref={planRef} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                plan
              </Badge>
              <span className="text-sm font-medium">Ordered step list</span>
            </div>
            <ol className="mt-3 space-y-1.5 font-mono text-xs text-muted-foreground">
              {planSteps.map((line, i) => (
                <li
                  key={line}
                  className={`transition-opacity duration-300 ${
                    i < revealedPlanLines ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {i + 1}. {line}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Steps + result */}
        <div className="space-y-4">
          {demoSteps.map((step) => (
            <StepCard
              key={step.id}
              ref={(el) => {
                stepRefs.current[step.id] = el;
              }}
              step={step}
              status={stepStatuses[step.id]}
            />
          ))}

          <div
            ref={resultRef}
            className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
              assembled ? "border-emerald-500/50 bg-emerald-500/5" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Assembled: Problem Statement</span>
              {assembled && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  no hallucination detected
                </Badge>
              )}
            </div>
            <AnimatePresence>
              {assembled && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap"
                >
                  {demoSteps.find((s) => s.id === "generate")?.output}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
