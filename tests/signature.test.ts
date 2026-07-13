import { describe, expect, it } from "vitest";
import { createLineSignature, verifyLineSignature } from "@/lib/line/signature";

describe("LINE signature verification", () => {
  const body = JSON.stringify({ events: [] });
  const secret = "test-channel-secret";

  it("accepts a valid signature", () => {
    expect(
      verifyLineSignature(body, createLineSignature(body, secret), secret),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(
      verifyLineSignature(body, createLineSignature("other", secret), secret),
    ).toBe(false);
  });

  it("rejects a different-length signature safely", () => {
    expect(verifyLineSignature(body, "short", secret)).toBe(false);
  });
});
