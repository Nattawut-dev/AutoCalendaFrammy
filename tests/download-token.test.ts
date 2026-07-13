import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDownloadToken,
  verifyDownloadToken,
} from "@/lib/security/download-token";

describe("download token", () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const jobId = randomUUID();
  const binding = "binding-value-with-enough-entropy";
  const now = Date.UTC(2026, 6, 13, 12, 0, 0);

  it("creates and verifies a valid token", () => {
    const token = createDownloadToken(jobId, binding, secret, now);
    expect(verifyDownloadToken(token, jobId, secret, now + 1000)).toMatchObject(
      { jobId, binding },
    );
  });

  it("rejects a modified token", () => {
    const token = createDownloadToken(jobId, binding, secret, now);
    expect(() =>
      verifyDownloadToken(`${token}x`, jobId, secret, now),
    ).toThrow();
  });

  it("rejects a wrong job ID", () => {
    const token = createDownloadToken(jobId, binding, secret, now);
    expect(() =>
      verifyDownloadToken(token, randomUUID(), secret, now),
    ).toThrow();
  });

  it("rejects an expired token", () => {
    const token = createDownloadToken(jobId, binding, secret, now);
    expect(() =>
      verifyDownloadToken(token, jobId, secret, now + 16 * 60 * 1000),
    ).toThrow();
  });
});
