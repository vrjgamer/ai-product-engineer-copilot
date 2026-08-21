"use client";

import { useEffect, useState } from "react";

/**
 * True once mounted client-side. `@xyflow/react` needs real browser APIs
 * (`ResizeObserver`, viewport dimensions) it doesn't have during SSR — the
 * server renders an empty/unmeasured canvas, and when the client then
 * renders something different on hydration, React discards and re-renders
 * that subtree from scratch to recover.
 *
 * Gating browser-only rendering behind this hook keeps the server's HTML
 * and the client's first paint identical (both render nothing / a
 * placeholder), so there's no mismatch to recover from.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // The canonical exception to "don't setState in an effect": there is no
  // render-time way to tell "server, or the client's first render before
  // hydration" apart from "the client, post-mount" — that distinction is
  // what an effect is for. A lazy useState initializer can't do this either:
  // `typeof window` is already defined on the client's *first* render, before
  // this effect runs, so it would return `true` immediately — exactly the
  // server/client mismatch this hook exists to avoid.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return mounted;
}
