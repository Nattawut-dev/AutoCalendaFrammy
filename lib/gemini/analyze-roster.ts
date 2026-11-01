import "server-only";

import {
  ApiError,
  MediaResolution,
  ThinkingLevel,
  type Schema,
} from "@google/genai";
import { getEnv } from "@/lib/env";
import { GeminiAnalysisError, type GeminiFailureReason } from "@/lib/errors";
import { getGeminiClient } from "@/lib/gemini/client";
import {
  ROSTER_AUDIT_PROMPT,
  ROSTER_AUDIT_RESPONSE_SCHEMA,
  ROSTER_ANALYSIS_PROMPT,
  ROSTER_RESPONSE_SCHEMA,
} from "@/lib/gemini/prompt";
import { applyIndependentAudit } from "@/lib/roster/audit";
import { expandCompactRoster } from "@/lib/roster/expand-compact";
import { normalizeRoster } from "@/lib/roster/normalize";
import { rosterAuditSchema } from "@/lib/schemas";
import type { RosterAnalysis } from "@/lib/types";

export type GeminiFailure = {
  reason: GeminiFailureReason;
  status?: number;
};

/** Vercel stops the webhook at 60s; leave time for download, storage and reply. */
export const GEMINI_TIME_BUDGET_MS = 48_000;
const MIN_ATTEMPT_MS = 8_000;

class GeminiDeadlineError extends Error {
  constructor() {
    super("Gemini time budget exhausted");
    this.name = "GeminiDeadlineError";
  }
}

export function classifyGeminiFailure(error: unknown): GeminiFailure {
  if (
    error instanceof GeminiDeadlineError ||
    (error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError"))
  ) {
    return { reason: "timeout" };
  }
  if (!(error instanceof ApiError)) {
    if (error instanceof Error) return { reason: "invalid_response" };
    return { reason: "unknown" };
  }

  const message = error.message.toLowerCase();
  if (
    error.status === 401 ||
    error.status === 403 ||
    message.includes("api key") ||
    message.includes("permission_denied")
  ) {
    return { reason: "authentication", status: error.status };
  }
  if (
    error.status === 429 ||
    message.includes("resource_exhausted") ||
    message.includes("quota")
  ) {
    return { reason: "rate_limited", status: error.status };
  }
  if (error.status === 404 || message.includes("model not found")) {
    return { reason: "model_not_found", status: error.status };
  }
  if (error.status === 400 || error.status === 422) {
    return { reason: "invalid_request", status: error.status };
  }
  if (error.status >= 500) {
    return { reason: "service_unavailable", status: error.status };
  }
  return { reason: "unknown", status: error.status };
}

export function createVisionConfig(
  model: string,
  responseSchema: Schema,
  thinkingLevel: ThinkingLevel = ThinkingLevel.LOW,
) {
  const isGemini3 = /^gemini-3(?:\.|$)/.test(model);
  return {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema,
    ...(isGemini3
      ? {
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
          thinkingConfig: { thinkingLevel },
        }
      : {}),
  };
}

/** Retries 503/429 only while the shared deadline leaves room for a real attempt. */
async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deadline: number,
  cancel: AbortSignal,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown = new GeminiDeadlineError();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw new GeminiDeadlineError();
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new GeminiDeadlineError()),
      remaining,
    );
    try {
      return await fn(AbortSignal.any([cancel, timeout.signal]));
    } catch (error) {
      lastError = error;
      const failure = classifyGeminiFailure(error);
      const isRetryable =
        failure.reason === "service_unavailable" ||
        failure.reason === "rate_limited";
      if (!isRetryable || attempt === maxAttempts - 1) throw error;
      const delayMs = 2000 * Math.pow(2, attempt) + Math.random() * 500;
      if (deadline - Date.now() - delayMs < MIN_ATTEMPT_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

type Stage = "analysis" | "audit";

type UsageLike = {
  promptTokenCount?: number;
  thoughtsTokenCount?: number;
  candidatesTokenCount?: number;
};

const usageFields = (usage: UsageLike | undefined) => ({
  promptTokens: usage?.promptTokenCount,
  thoughtsTokens: usage?.thoughtsTokenCount,
  outputTokens: usage?.candidatesTokenCount,
});

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  const model = getEnv().GEMINI_MODEL;
  const startedAt = Date.now();
  const deadline = startedAt + GEMINI_TIME_BUDGET_MS;
  const cancel = new AbortController();
  // Both stages run at once, so each keeps its own model/timing for the logs.
  const stageModel: Record<Stage, string> = { analysis: model, audit: model };
  let failedStage: Stage | undefined;
  try {
    const imageData = Buffer.from(image).toString("base64");
    const client = getGeminiClient();
    const makeImagePart = () => ({
      inlineData: { mimeType, data: imageData },
    });
    const callModel = (
      stage: Stage,
      targetModel: string,
      contents: unknown[],
      schema: Schema,
      thinkingLevel: ThinkingLevel,
      attempts: { count: number },
      maxAttempts?: number,
    ) => {
      stageModel[stage] = targetModel;
      return withRetry(
        (abortSignal) => {
          attempts.count += 1;
          return client.models.generateContent({
            model: targetModel,
            contents: contents as never,
            config: {
              ...createVisionConfig(targetModel, schema, thinkingLevel),
              abortSignal,
            },
          });
        },
        deadline,
        cancel.signal,
        maxAttempts,
      );
    };
    const generateRosterContent = async (
      stage: Stage,
      prompt: string,
      schema: Schema,
      thinkingLevel: ThinkingLevel,
    ) => {
      const contents = [
        {
          role: "user",
          parts: [{ text: prompt }, makeImagePart()],
        },
      ];
      const stageStart = Date.now();
      const attempts = { count: 0 };
      const logStage = (fields: Record<string, unknown>) =>
        console.info(
          JSON.stringify({
            level: "info",
            operation: "gemini_roster_stage",
            stage,
            model: stageModel[stage],
            thinkingLevel,
            attempts: attempts.count,
            elapsedMs: Date.now() - stageStart,
            ...fields,
          }),
        );
      const run = async () => {
        try {
          return await callModel(
            stage,
            model,
            contents,
            schema,
            thinkingLevel,
            attempts,
          );
        } catch (error) {
          // Only the audit (codes only) may fall back after a persistent 503.
          // Measured on the Nov 2026 roster, gemini-3.6-flash reads codes
          // correctly but misreads cell colors, which would silently change
          // OT times, so the analysis never falls back.
          if (
            stage !== "audit" ||
            model !== "gemini-3.8-flash" ||
            classifyGeminiFailure(error).status !== 503
          ) {
            throw error;
          }
          const fallbackModel = "gemini-3.6-flash";
          console.warn(
            JSON.stringify({
              level: "warn",
              operation: "gemini_roster_fallback",
              stage,
              fromModel: model,
              toModel: fallbackModel,
              status: 503,
            }),
          );
          try {
            return await callModel(
              stage,
              fallbackModel,
              contents,
              schema,
              thinkingLevel,
              attempts,
              2,
            );
          } catch (fallbackError) {
            const failure = classifyGeminiFailure(fallbackError);
            console.warn(
              JSON.stringify({
                level: "warn",
                operation: "gemini_roster_fallback",
                stage,
                result: "failed",
                toModel: fallbackModel,
                category: failure.reason,
                ...(failure.status === undefined
                  ? {}
                  : { status: failure.status }),
              }),
            );
            throw error;
          }
        }
      };
      try {
        const response = await run();
        logStage({
          result: "ok",
          ...usageFields(response.usageMetadata),
          finishReason: response.candidates?.[0]?.finishReason,
        });
        return { response, modelUsed: stageModel[stage] };
      } catch (error) {
        logStage({
          result: cancel.signal.aborted && failedStage ? "cancelled" : "failed",
          category: classifyGeminiFailure(error).reason,
        });
        throw error;
      }
    };

    // Run both at once so the pair fits Vercel's limit; 503s are retried
    // within the budget. If one fails, stop the other.
    const stopOnFailure = <T>(stage: Stage, promise: Promise<T>) =>
      promise.catch((error: unknown) => {
        failedStage ??= stage;
        cancel.abort();
        throw error;
      });
    const [analysis, auditResult] = await Promise.all([
      stopOnFailure(
        "analysis",
        generateRosterContent(
          "analysis",
          ROSTER_ANALYSIS_PROMPT,
          ROSTER_RESPONSE_SCHEMA,
          // Measured on the Nov 2026 roster: LOW was as accurate as MEDIUM
          // with ~12k fewer thinking tokens.
          ThinkingLevel.LOW,
        ),
      ),
      // The audit only transcribes one row, so it needs little reasoning.
      stopOnFailure(
        "audit",
        generateRosterContent(
          "audit",
          ROSTER_AUDIT_PROMPT,
          ROSTER_AUDIT_RESPONSE_SCHEMA,
          ThinkingLevel.LOW,
        ),
      ),
    ]);

    if (!analysis.response.text || !auditResult.response.text) {
      throw new Error("empty model response");
    }
    const roster = normalizeRoster(
      expandCompactRoster(JSON.parse(analysis.response.text)),
    );
    const audit = rosterAuditSchema.parse(
      JSON.parse(auditResult.response.text),
    );
    const auditedRoster = applyIndependentAudit(roster, audit);
    const mismatchCount = auditedRoster.warnings.filter((warning) =>
      warning.code.startsWith("independent_"),
    ).length;
    console.info(
      JSON.stringify({
        level: "info",
        operation: "gemini_roster_verification",
        result: mismatchCount === 0 ? "matched" : "mismatch",
        mismatchCount,
        model,
        analysisModel: analysis.modelUsed,
        auditModel: auditResult.modelUsed,
        elapsedMs: Date.now() - startedAt,
      }),
    );
    return auditedRoster;
  } catch (error) {
    const failure = classifyGeminiFailure(error);
    console.error(
      JSON.stringify({
        level: "error",
        operation: "gemini_roster_analysis",
        category: failure.reason,
        model,
        stage: failedStage ?? "parse",
        activeModel: failedStage ? stageModel[failedStage] : model,
        elapsedMs: Date.now() - startedAt,
        mimeType,
        imageBytes: image.byteLength,
        ...(failure.status === undefined ? {} : { status: failure.status }),
      }),
    );
    throw new GeminiAnalysisError(failure.reason, failure.status);
  }
}
