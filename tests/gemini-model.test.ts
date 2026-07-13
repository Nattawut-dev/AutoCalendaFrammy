import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModelName,
} from "@/lib/gemini/model";

describe("Gemini model configuration", () => {
  it("uses the required stable default", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
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
