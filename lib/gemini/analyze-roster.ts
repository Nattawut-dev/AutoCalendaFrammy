import "server-only";

import { ApiError } from "@google/genai";
import { getEnv } from "@/lib/env";
import { GeminiAnalysisError, type GeminiFailureReason } from "@/lib/errors";
import { getGeminiClient } from "@/lib/gemini/client";
import {
  ROSTER_ANALYSIS_PROMPT,
  ROSTER_RESPONSE_SCHEMA,
} from "@/lib/gemini/prompt";
import { normalizeRoster } from "@/lib/roster/normalize";
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

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  const model = getEnv().GEMINI_MODEL;
  try {
    const response = await getGeminiClient().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: ROSTER_ANALYSIS_PROMPT },
            {
              inlineData: {
                mimeType,
                data: Buffer.from(image).toString("base64"),
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: ROSTER_RESPONSE_SCHEMA,
      },
    });
    if (!response.text) throw new Error("empty model response");
    return normalizeRoster(JSON.parse(response.text));
  } catch (error) {
    const failure = classifyGeminiFailure(error);
    console.error(
      JSON.stringify({
        level: "error",
        operation: "gemini_roster_analysis",
        category: failure.reason,
        model,
        ...(failure.status === undefined ? {} : { status: failure.status }),
      }),
    );
    throw new GeminiAnalysisError(failure.reason, failure.status);
  }
}
