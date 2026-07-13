import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deserializeJob,
  eventKey,
  jobKey,
  rateLimitKey,
  serializeJob,
} from "@/lib/storage/jobs";
import { sampleRoster } from "@/tests/fixtures/sample-roster";

describe("storage helpers", () => {
  it("creates namespaced keys", () => {
    expect(jobKey("abc")).toBe("roster-job:abc");
    expect(eventKey("event-1")).toBe("line-event:event-1");
    expect(rateLimitKey("user-hash", 10)).toBe("line-rate:user-hash:10");
  });

  it("serializes and validates jobs without Redis", () => {
    const now = new Date();
    const job = {
      id: randomUUID(),
      userId: "hashed-user-binding",
      status: "ready" as const,
      roster: sampleRoster,
      sourceMessageId: "message-1",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    };
    expect(deserializeJob(serializeJob(job))).toEqual(job);
  });
});
