"use client";

import { useEffect, useState } from "react";

import type { ReplaySchedule } from "./replaySchedule";

export interface ReplayPlayer {
  elapsedMs: number;
  playing: boolean;
  restart: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Drives `replaySchedule.ts`'s pure `viewStateAtElapsed` over time via
 * `requestAnimationFrame`. This is the one piece of TDD 0015 that is
 * deliberately *not* unit-tested — the notes call out testing the schedule,
 * not the timer. Honours `prefers-reduced-motion` (and any environment
 * without `requestAnimationFrame`) by jumping straight to the finished
 * traversal instead of animating it; state still comes through via colour
 * and label on the final frame, same as a completed graph.
 */
export function useReplayPlayer(schedule: ReplaySchedule): ReplayPlayer {
  const [skipAnimation] = useState(() => prefersReducedMotion() || typeof requestAnimationFrame === "undefined");
  const [elapsedMs, setElapsedMs] = useState(() => (skipAnimation ? schedule.totalMs : 0));
  const [playing, setPlaying] = useState(() => !skipAnimation);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    // Reduced motion (or an environment without rAF) has nothing to
    // animate — `elapsedMs` already starts at `schedule.totalMs` via the
    // lazy initializer above, so there's no state left to synchronize here.
    if (skipAnimation) return;

    let startTimestamp: number | null = null;
    let frame: number;

    function tick(timestamp: number) {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      if (elapsed >= schedule.totalMs) {
        setElapsedMs(schedule.totalMs);
        setPlaying(false);
        return;
      }
      setElapsedMs(elapsed);
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [schedule, restartKey, skipAnimation]);

  function restart() {
    // Reset state directly here (an event handler, not the effect above) so
    // the UI reflects the restart immediately, before the next rAF tick.
    setElapsedMs(0);
    setPlaying(true);
    setRestartKey((key) => key + 1);
  }

  return { elapsedMs, playing, restart };
}
