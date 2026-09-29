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

export function classifyGeminiFailure(error: unknown): GeminiFailure {
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

export function createVisionConfig(model: string, responseSchema: Schema) {
  const isGemini3 = /^gemini-3(?:\.|$)/.test(model);
  return {
    temperature: 0,
    responseMimeType: "application/json",
    responseSchema,
    ...(isGemini3
      ? {
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        }
      : {}),
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const failure = classifyGeminiFailure(error);
      const isRetryable =
        failure.reason === "service_unavailable" ||
        failure.reason === "rate_limited";
      if (!isRetryable || attempt === maxAttempts - 1) throw error;
      const delayMs = 2000 * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  const model = getEnv().GEMINI_MODEL;
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
        const response = await withRetry(() =>
          client.models.generateContent({
            model,
            contents,
            config: createVisionConfig(model, schema),
          }),
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
            () =>
              client.models.generateContent({
                model: fallbackModel,
                contents,
                config: createVisionConfig(fallbackModel, schema),
              }),
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

    // Sequential to avoid overloading thinking models with concurrent requests
    const analysis = await generateRosterContent(
      "analysis",
      ROSTER_ANALYSIS_PROMPT,
      ROSTER_RESPONSE_SCHEMA,
    );
    const auditResult = await generateRosterContent(
      "audit",
      ROSTER_AUDIT_PROMPT,
      ROSTER_AUDIT_RESPONSE_SCHEMA,
    );

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
