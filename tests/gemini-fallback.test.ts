import { ApiError } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRosterImage } from "@/lib/gemini/analyze-roster";
import { validateRoster } from "@/lib/roster/validate";
import { sampleRoster } from "@/tests/fixtures/sample-roster";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ GEMINI_MODEL: "gemini-3.8-flash" }),
}));
vi.mock("@/lib/gemini/client", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
}));

const audit = {
  employee: sampleRoster.employee,
  month: sampleRoster.month,
  year: sampleRoster.year,
  printedOffCount: sampleRoster.printedOffCount,
  cells: sampleRoster.shifts.map((shift) => ({
    day: Number(shift.date.slice(-2)),
    printedWeekday: shift.printedWeekday,
    code: shift.code,
    rawCellText: shift.rawCellText,
    confidence: 0.99,
  })),
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  generateContent.mockReset();
});

describe("Gemini 503 recovery", () => {
  it("uses the previous stable model after persistent 503 and still audits the roster", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent.mockImplementation(async ({ model, contents }) => {
      if (model === "gemini-3.8-flash") {
        throw new ApiError({ status: 503, message: "UNAVAILABLE" });
      }
      const isAudit = contents[0].parts[0].text.includes("independent");
      return { text: JSON.stringify(isAudit ? audit : sampleRoster) };
    });

    const result = analyzeRosterImage(new Uint8Array([1, 2, 3]), "image/jpeg");
    const assertion = expect(result).resolves.toMatchObject({
      printedOffCount: 10,
      warnings: [],
    });
    await vi.runAllTimersAsync();
    await assertion;

    const models = generateContent.mock.calls.map(([request]) => request.model);
    expect(models.filter((m) => m === "gemini-3.8-flash")).toHaveLength(6);
    expect(models.filter((m) => m === "gemini-3.6-flash")).toHaveLength(2);
  });

  it("does not switch models for a bad request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContent.mockRejectedValue(
      new ApiError({ status: 400, message: "INVALID_ARGUMENT" }),
    );

    await expect(
      analyzeRosterImage(new Uint8Array([1]), "image/jpeg"),
    ).rejects.toMatchObject({ reason: "invalid_request", status: 400 });
    // Analysis and audit start together; neither retries a 400.
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not make a mismatched fallback audit confirmable", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    generateContent.mockImplementation(async ({ model, contents }) => {
      if (model === "gemini-3.8-flash") {
        throw new ApiError({ status: 503, message: "UNAVAILABLE" });
      }
      const isAudit = contents[0].parts[0].text.includes("independent");
      if (!isAudit) return { text: JSON.stringify(sampleRoster) };
      const mismatchedAudit = structuredClone(audit);
      mismatchedAudit.cells[0].code = "K9";
      return { text: JSON.stringify(mismatchedAudit) };
    });

    const result = analyzeRosterImage(new Uint8Array([1]), "image/jpeg");
    await vi.runAllTimersAsync();
    const roster = await result;

    expect(validateRoster(roster).confirmable).toBe(false);
    expect(roster.warnings).toContainEqual(
      expect.objectContaining({ code: "independent_code_mismatch" }),
    );
  });

  it("keeps the primary 503 when the fallback model is unavailable", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    generateContent.mockImplementation(async ({ model }) => {
      throw new ApiError({
        status: model === "gemini-3.8-flash" ? 503 : 404,
        message: "provider error",
      });
    });

    const failure = analyzeRosterImage(new Uint8Array([1]), "image/jpeg").catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();

    expect(await failure).toMatchObject({
      reason: "service_unavailable",
      status: 503,
    });
    const models = generateContent.mock.calls.map(([request]) => request.model);
    expect(models.slice(-1)).toEqual(["gemini-3.6-flash"]);
    expect(
      models.filter((m) => m === "gemini-3.6-flash").length,
    ).toBeLessThanOrEqual(2);
  });
});

describe("Gemini time budget", () => {
  it("stops retrying before Vercel's 60s limit and reports a timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = Date.now();
    generateContent.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        // Each slow 503 burns most of the budget; abort ends it like the SDK.
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new ApiError({ status: 503, message: "UNAVAILABLE" })),
            30_000,
          );
          config.abortSignal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "TimeoutError"));
          });
        }),
    );

    const failure = analyzeRosterImage(new Uint8Array([1]), "image/jpeg").catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();

    expect(await failure).toMatchObject({ reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(55_000);
  });

  it("passes an abort signal and runs the audit with low thinking", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    generateContent.mockImplementation(async ({ contents }) => {
      const isAudit = contents[0].parts[0].text.includes("independent");
      return { text: JSON.stringify(isAudit ? audit : sampleRoster) };
    });
    await analyzeRosterImage(new Uint8Array([1]), "image/jpeg");
    const configs = generateContent.mock.calls.map(([r]) => r.config);
    expect(configs.every((c) => c.abortSignal instanceof AbortSignal)).toBe(
      true,
    );
    expect(configs.map((c) => c.thinkingConfig.thinkingLevel).sort()).toEqual([
      "LOW",
      "MEDIUM",
    ]);
  });
});
