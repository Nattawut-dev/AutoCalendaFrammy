import { MediaResolution, ThinkingLevel } from "@google/genai";
import { describe, expect, it } from "vitest";
import { createVisionConfig } from "@/lib/gemini/analyze-roster";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModelName,
} from "@/lib/gemini/model";
import {
  ROSTER_ANALYSIS_PROMPT,
  ROSTER_RESPONSE_SCHEMA,
} from "@/lib/gemini/prompt";

describe("Gemini model configuration", () => {
  it("uses the required stable default", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
  });

  it("uses high-resolution vision and low thinking for Gemini 3", () => {
    expect(
      createVisionConfig("gemini-3.6-flash", ROSTER_RESPONSE_SCHEMA),
    ).toMatchObject({
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
  });

  it("keeps legacy Gemini 2.5 configuration compatible", () => {
    expect(
      createVisionConfig("gemini-2.5-flash-lite", ROSTER_RESPONSE_SCHEMA),
    ).not.toHaveProperty("mediaResolution");
  });

  it("asks the model to copy the printed legend instead of calculating times", () => {
    expect(ROSTER_ANALYSIS_PROMPT).toContain("legend.shiftTimes");
    expect(ROSTER_ANALYSIS_PROMPT).toContain("do not calculate");
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
