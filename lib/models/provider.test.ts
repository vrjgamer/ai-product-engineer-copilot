import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicModel = { provider: "anthropic" };
const openaiModel = { provider: "openai" };
const googleModel = { provider: "google" };

const createAnthropic = vi.fn(() => vi.fn(() => anthropicModel));
const createOpenAI = vi.fn(() => vi.fn(() => openaiModel));
const createGoogleGenerativeAI = vi.fn(() => vi.fn(() => googleModel));

vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));

const ORIGINAL_ENV = { ...process.env };

describe("getModel", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_ID;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it("defaults to Anthropic Haiku 4.5 when MODEL_PROVIDER is unset", async () => {
    const { getModel } = await import("./provider");

    const model = getModel();

    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "test-anthropic-key" });
    expect(createAnthropic.mock.results[0].value).toHaveBeenCalledWith("claude-haiku-4-5");
    expect(model).toBe(anthropicModel);
  });

  it("returns an Anthropic model instance when MODEL_PROVIDER=anthropic", async () => {
    process.env.MODEL_PROVIDER = "anthropic";
    process.env.MODEL_ID = "claude-haiku-4-5";
    const { getModel } = await import("./provider");

    const model = getModel();

    expect(model).toBe(anthropicModel);
  });

  it("returns an OpenAI model instance when MODEL_PROVIDER=openai", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.MODEL_ID = "gpt-4o-mini";
    const { getModel } = await import("./provider");

    const model = getModel();

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "test-openai-key" });
    expect(createOpenAI.mock.results[0].value).toHaveBeenCalledWith("gpt-4o-mini");
    expect(model).toBe(openaiModel);
  });

  it("returns a Google model instance when MODEL_PROVIDER=google", async () => {
    process.env.MODEL_PROVIDER = "google";
    process.env.MODEL_ID = "gemini-2.0-flash";
    const { getModel } = await import("./provider");

    const model = getModel();

    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-google-key" });
    expect(createGoogleGenerativeAI.mock.results[0].value).toHaveBeenCalledWith(
      "gemini-2.0-flash",
    );
    expect(model).toBe(googleModel);
  });

  it("throws a descriptive error for an unrecognized MODEL_PROVIDER", async () => {
    process.env.MODEL_PROVIDER = "not-a-real-provider";
    const { getModel } = await import("./provider");

    expect(() => getModel()).toThrow(/Unsupported MODEL_PROVIDER "not-a-real-provider"/);
  });

  it("throws a descriptive error when the provider's API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { getModel } = await import("./provider");

    expect(() => getModel()).toThrow(/Missing ANTHROPIC_API_KEY/);
  });
});
