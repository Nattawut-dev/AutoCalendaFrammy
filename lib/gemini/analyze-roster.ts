import "server-only";

import { getEnv } from "@/lib/env";
import { GeminiAnalysisError } from "@/lib/errors";
import { getGeminiClient } from "@/lib/gemini/client";
import {
  ROSTER_ANALYSIS_PROMPT,
  ROSTER_RESPONSE_SCHEMA,
} from "@/lib/gemini/prompt";
import { normalizeRoster } from "@/lib/roster/normalize";
import type { RosterAnalysis } from "@/lib/types";

export async function analyzeRosterImage(
  image: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<RosterAnalysis> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getEnv().GEMINI_MODEL,
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
    console.error(
      JSON.stringify({
        level: "error",
        operation: "gemini_roster_analysis",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    throw new GeminiAnalysisError();
  }
}
