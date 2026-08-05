import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openaiEmbeddingModel = { provider: "openai-embedding" };
const googleEmbeddingModel = { provider: "google-embedding" };

const createOpenAI = vi.fn(() => ({ textEmbeddingModel: vi.fn(() => openaiEmbeddingModel) }));
const createGoogleGenerativeAI = vi.fn(() => ({
  textEmbeddingModel: vi.fn(() => googleEmbeddingModel),
}));
const embed = vi.fn(async (_arg: unknown) => ({ embedding: [0.1, 0.2, 0.3] }));

vi.mock("@ai-sdk/openai", () => ({ createOpenAI }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));
vi.mock("ai", () => ({ embed: (arg: unknown) => embed(arg) }));

const ORIGINAL_ENV = { ...process.env };

describe("embedText", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EMBEDDING_PROVIDER;
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to Google when EMBEDDING_PROVIDER is unset", async () => {
    const { embedText } = await import("./embeddings");

    await embedText("hello");

    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-google-key" });
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({
        model: googleEmbeddingModel,
        value: "hello",
        providerOptions: { google: { outputDimensionality: 1536 } },
      }),
    );
  });

  it("uses OpenAI's embedding model when EMBEDDING_PROVIDER=openai", async () => {
    process.env.EMBEDDING_PROVIDER = "openai";
    const { embedText } = await import("./embeddings");

    await embedText("hello");

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "test-openai-key" });
    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({
        model: openaiEmbeddingModel,
        providerOptions: { openai: { dimensions: 1536 } },
      }),
    );
  });

  it("throws a descriptive error for an unrecognized EMBEDDING_PROVIDER", async () => {
    process.env.EMBEDDING_PROVIDER = "not-a-real-provider";
    const { embedText } = await import("./embeddings");

    await expect(embedText("hello")).rejects.toThrow(/Unsupported EMBEDDING_PROVIDER/);
  });

  it("throws a descriptive error when the provider's API key is missing", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { embedText } = await import("./embeddings");

    await expect(embedText("hello")).rejects.toThrow(/Missing GOOGLE_GENERATIVE_AI_API_KEY/);
  });
});
