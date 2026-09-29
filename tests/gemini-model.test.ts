import { MediaResolution, ThinkingLevel } from "@google/genai";
import { describe, expect, it } from "vitest";
import { createVisionConfig } from "@/lib/gemini/analyze-roster";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModelName,
} from "@/lib/gemini/model";
import { ROSTER_RESPONSE_SCHEMA } from "@/lib/gemini/prompt";

describe("Gemini model configuration", () => {
  it("uses the required stable default", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  it("uses high-resolution vision and medium thinking for Gemini 3", () => {
    expect(
      createVisionConfig("gemini-3.6-flash", ROSTER_RESPONSE_SCHEMA),
    ).toMatchObject({
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    });
  });

  it("keeps legacy Gemini 2.5 configuration compatible", () => {
    expect(
      createVisionConfig("gemini-2.5-flash-lite", ROSTER_RESPONSE_SCHEMA),
    ).not.toHaveProperty("mediaResolution");
  });

  it.each([
    [" gemini-2.5-flash-lite ", "gemini-2.5-flash-lite"],
    ['"gemini-2.5-flash-lite"', "gemini-2.5-flash-lite"],
    ["'gemini-2.5-flash-lite'", "gemini-2.5-flash-lite"],
    ["models/gemini-2.5-flash-lite", "gemini-2.5-flash-lite"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeGeminiModelName(input)).toBe(expected);
  });
});
