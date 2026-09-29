import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import { getEnv } from "@/lib/env";

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = getEnv().GEMINI_API_KEY;
    if (!apiKey)
      throw new ApiError({ status: 401, message: "Missing Gemini API key" });
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}
