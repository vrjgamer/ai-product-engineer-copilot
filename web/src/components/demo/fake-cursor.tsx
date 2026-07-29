"use client";

import { motion } from "motion/react";

interface FakeCursorProps {
  x: number;
  y: number;
  clicking: boolean;
  visible: boolean;
}

export function FakeCursor({ x, y, clicking, visible }: FakeCursorProps) {
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-50"
      animate={{ x, y, opacity: visible ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 22, mass: 0.6 }}
    >
      <motion.div
        animate={clicking ? { scale: [1, 0.8, 1] } : { scale: 1 }}
        transition={{ duration: 0.25 }}
        className="relative"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          className="drop-shadow-md"
        >
          <path
            d="M4 2L20 12L12.5 13.5L9 21L4 2Z"
            fill="currentColor"
            className="text-foreground"
            stroke="var(--background)"
            strokeWidth="1"
          />
        </svg>
        {clicking && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0.6 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute -left-2 -top-2 size-8 rounded-full bg-primary/40"
          />
        )}
      </motion.div>
    </motion.div>
  );
}
