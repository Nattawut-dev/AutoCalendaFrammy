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
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        }
      : {}),
  };
}

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  const model = getEnv().GEMINI_MODEL;
  try {
    const imageData = Buffer.from(image).toString("base64");
    const client = getGeminiClient();
    const [analysisResponse, auditResponse] = await Promise.all([
      client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: ROSTER_ANALYSIS_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: imageData,
                },
              },
            ],
          },
        ],
        config: createVisionConfig(model, ROSTER_RESPONSE_SCHEMA),
      }),
      client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: ROSTER_AUDIT_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: imageData,
                },
              },
            ],
          },
        ],
        config: createVisionConfig(model, ROSTER_AUDIT_RESPONSE_SCHEMA),
      }),
    ]);
    if (!analysisResponse.text || !auditResponse.text) {
      throw new Error("empty model response");
    }
    const roster = normalizeRoster(JSON.parse(analysisResponse.text));
    const audit = rosterAuditSchema.parse(JSON.parse(auditResponse.text));
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
        mimeType,
        imageBytes: image.byteLength,
        ...(failure.status === undefined ? {} : { status: failure.status }),
      }),
    );
    throw new GeminiAnalysisError(failure.reason, failure.status);
  }
}
