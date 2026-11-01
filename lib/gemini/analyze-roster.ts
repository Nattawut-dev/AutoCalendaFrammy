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
  thinkingLevel: ThinkingLevel = ThinkingLevel.MEDIUM,
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

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  const model = getEnv().GEMINI_MODEL;
  const deadline = Date.now() + GEMINI_TIME_BUDGET_MS;
  const cancel = new AbortController();
  let activeModel = model;
  let activeStage: "analysis" | "audit" = "analysis";
  try {
    const imageData = Buffer.from(image).toString("base64");
    const client = getGeminiClient();
    const makeImagePart = () => ({
      inlineData: { mimeType, data: imageData },
    });
    const generateRosterContent = async (
      stage: "analysis" | "audit",
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
      activeStage = stage;
      activeModel = model;
      try {
        const response = await withRetry(
          (abortSignal) =>
            client.models.generateContent({
              model,
              contents,
              config: {
                ...createVisionConfig(model, schema, thinkingLevel),
                abortSignal,
              },
            }),
          deadline,
          cancel.signal,
        );
        return { response, modelUsed: model };
      } catch (error) {
        // Preserve the chosen model for all normal requests. Only a persistent
        // 503 on the new default model is eligible for the previous stable model.
        if (
          model !== "gemini-3.8-flash" ||
          classifyGeminiFailure(error).status !== 503
        ) {
          throw error;
        }
        const fallbackModel = "gemini-3.6-flash";
        activeModel = fallbackModel;
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
          const response = await withRetry(
            (abortSignal) =>
              client.models.generateContent({
                model: fallbackModel,
                contents,
                config: {
                  ...createVisionConfig(fallbackModel, schema, thinkingLevel),
                  abortSignal,
                },
              }),
            deadline,
            cancel.signal,
            2,
          );
          return { response, modelUsed: fallbackModel };
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

    // Run both at once so the pair fits Vercel's 60s limit; 503s are retried
    // within the budget. If one fails, stop the other.
    const stopOnFailure = <T>(promise: Promise<T>) =>
      promise.catch((error: unknown) => {
        cancel.abort();
        throw error;
      });
    const [analysis, auditResult] = await Promise.all([
      stopOnFailure(
        generateRosterContent(
          "analysis",
          ROSTER_ANALYSIS_PROMPT,
          ROSTER_RESPONSE_SCHEMA,
          ThinkingLevel.MEDIUM,
        ),
      ),
      // The audit only transcribes one row, so it needs little reasoning.
      stopOnFailure(
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
    const roster = normalizeRoster(JSON.parse(analysis.response.text));
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
        activeModel,
        stage: activeStage,
        mimeType,
        imageBytes: image.byteLength,
        ...(failure.status === undefined ? {} : { status: failure.status }),
      }),
    );
    throw new GeminiAnalysisError(failure.reason, failure.status);
  }
}
