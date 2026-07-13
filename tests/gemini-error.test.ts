import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { classifyGeminiFailure } from "@/lib/gemini/analyze-roster";

describe("Gemini error classification", () => {
  it.each([
    [400, "invalid_request"],
    [401, "authentication"],
    [403, "authentication"],
    [404, "model_not_found"],
    [429, "rate_limited"],
    [500, "service_unavailable"],
  ] as const)("maps HTTP %i to %s", (status, reason) => {
    const error = new ApiError({ status, message: "provider error" });
    expect(classifyGeminiFailure(error)).toEqual({ reason, status });
  });

  it("treats parsing errors as invalid model responses", () => {
    expect(classifyGeminiFailure(new SyntaxError("invalid JSON"))).toEqual({
      reason: "invalid_response",
    });
  });

  it("recognizes quota errors even when the provider uses another status", () => {
    const error = new ApiError({
      status: 400,
      message: "RESOURCE_EXHAUSTED: quota",
    });
    expect(classifyGeminiFailure(error)).toEqual({
      reason: "rate_limited",
      status: 400,
    });
  });
});
