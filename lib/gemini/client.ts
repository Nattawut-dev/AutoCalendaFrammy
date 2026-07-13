import "server-only";

import { GoogleGenAI } from "@google/genai";
import { getEnv } from "@/lib/env";

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY });
  return client;
}
