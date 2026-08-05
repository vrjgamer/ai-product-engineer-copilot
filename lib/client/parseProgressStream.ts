import { PROGRESS_CHUNK_TYPE, type StreamEvent } from "../graph/streamProtocol";

/**
 * Reads the SSE body produced by `app/api/generate/route.ts` (Vercel AI
 * SDK's `createUIMessageStreamResponse`, TDD 0005) and yields this app's own
 * `StreamEvent`s — the payload of each `data-progress` part — ignoring any
 * other UI-message-stream chunk type. Deliberately a minimal hand-rolled SSE
 * reader rather than the AI SDK's chat-message reconstruction helpers
 * (`readUIMessageStream`): this is a progress log, not a chat message, and
 * parsing the wire format directly keeps it trivially testable with fixture
 * SSE text and no fetch/DOM mocking.
 */
export async function* parseProgressStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = parseSseEvent(rawEvent);
        if (event) yield event;
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(rawEvent: string): StreamEvent | null {
  const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return null;

  const payload = dataLine.slice("data:".length).trim();
  if (payload === "" || payload === "[DONE]") return null;

  const chunk = JSON.parse(payload) as { type?: string; data?: unknown };
  if (chunk.type !== PROGRESS_CHUNK_TYPE) return null;

  return chunk.data as StreamEvent;
}
