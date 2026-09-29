import "server-only";

import { z } from "zod";
import {
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiModelName,
} from "@/lib/gemini/model";

const serverEnvSchema = z
  .object({
    LINE_CHANNEL_SECRET: z.string().min(1),
    LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z
      .string()
      .default(DEFAULT_GEMINI_MODEL)
      .transform(normalizeGeminiModelName)
      .pipe(z.string().min(1)),
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    DOWNLOAD_TOKEN_SECRET: z.string().min(32),
    ALLOWED_LINE_USER_IDS: z.string().min(1),
    APP_BASE_URL: z.url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      !value.APP_BASE_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL must use HTTPS in production",
      });
    }
  })
  .transform((value) => ({
    ...value,
    APP_BASE_URL: value.APP_BASE_URL.replace(/\/$/, ""),
    ALLOWED_LINE_USER_IDS: new Set(
      value.ALLOWED_LINE_USER_IDS.split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  }));

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean);
    throw new Error(
      `Invalid server configuration: ${[...new Set(names)].join(", ")}`,
    );
  }

  cachedEnv = result.data;
  return cachedEnv;
}
