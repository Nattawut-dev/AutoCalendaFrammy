import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("allows text-only configuration while image access reports a missing key", async () => {
  vi.resetModules();
  const env = {
    LINE_CHANNEL_SECRET: "test-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    DOWNLOAD_TOKEN_SECRET: "test-secret-at-least-thirty-two-characters",
    ALLOWED_LINE_USER_IDS: "allowed",
    APP_BASE_URL: "https://example.com",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("GEMINI_API_KEY", undefined);
  const { getEnv } = await import("@/lib/env");
  expect(getEnv().GEMINI_API_KEY).toBeUndefined();
  const { getGeminiClient } = await import("@/lib/gemini/client");
  expect(getGeminiClient).toThrow(expect.objectContaining({ status: 401 }));
});
