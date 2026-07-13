import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";
import { DOWNLOAD_TOKEN_TTL_SECONDS } from "@/lib/constants";
import { InvalidDownloadTokenError } from "@/lib/errors";
import { timingSafeStringEqual } from "@/lib/security/timing-safe";

const tokenPayloadSchema = z.object({
  jobId: z.uuid(),
  binding: z.string().min(16).max(128),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export type DownloadTokenPayload = z.infer<typeof tokenPayloadSchema>;

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createUserBinding(userId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`line-user:${userId}`)
    .digest("base64url");
}

export function createDownloadToken(
  jobId: string,
  binding: string,
  secret: string,
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000);
  const payload: DownloadTokenPayload = {
    jobId,
    binding,
    issuedAt,
    expiresAt: issuedAt + DOWNLOAD_TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyDownloadToken(
  token: string,
  expectedJobId: string,
  secret: string,
  now = Date.now(),
): DownloadTokenPayload {
  try {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) throw new Error("shape");
    if (!timingSafeStringEqual(signature, sign(encoded, secret))) {
      throw new Error("signature");
    }
    const payload = tokenPayloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    const nowSeconds = Math.floor(now / 1000);
    if (
      payload.jobId !== expectedJobId ||
      payload.expiresAt <= nowSeconds ||
      payload.expiresAt <= payload.issuedAt ||
      payload.issuedAt > nowSeconds + 60
    ) {
      throw new Error("claims");
    }
    return payload;
  } catch {
    throw new InvalidDownloadTokenError();
  }
}
