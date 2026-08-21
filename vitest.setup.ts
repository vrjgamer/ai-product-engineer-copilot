// jsdom doesn't implement ResizeObserver; @xyflow/react needs one to measure
// its canvas. A no-op stub is enough for tests, which never assert on layout.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
