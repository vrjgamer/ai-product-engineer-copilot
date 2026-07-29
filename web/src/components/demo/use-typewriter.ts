import { useEffect, useState } from "react";

/**
 * Reveals `text` one character at a time while `active` is true. Resets to
 * empty whenever `text` changes, so the same hook instance can be reused
 * across script loops.
 */
export function useTypewriter(text: string, active: boolean, charsPerTick = 1, tickMs = 18) {
  const [revealed, setRevealed] = useState("");

  useEffect(() => {
    setRevealed("");
    if (!active || !text) return;

    let i = 0;
    const id = setInterval(() => {
      i += charsPerTick;
      setRevealed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, tickMs);

    return () => clearInterval(id);
  }, [text, active, charsPerTick, tickMs]);

  return revealed;
}
