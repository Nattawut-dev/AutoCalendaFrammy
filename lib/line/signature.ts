import "server-only";

import { createHmac } from "node:crypto";
import { timingSafeStringEqual } from "@/lib/security/timing-safe";

export function createLineSignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  return timingSafeStringEqual(createLineSignature(rawBody, secret), signature);
}
