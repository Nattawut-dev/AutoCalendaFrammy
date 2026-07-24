import { randomUUID } from "node:crypto";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createPreviewMessages } from "@/lib/line/flex";
import { createCalendarReadyMessage } from "@/lib/line/messages";
import type { StoredRosterJob } from "@/lib/types";
import { sampleRoster } from "@/tests/fixtures/sample-roster";

const calendarActionSchema = z.object({
  template: z.object({
    actions: z.array(z.object({ label: z.string().max(20), uri: z.url() })),
  }),
});

function readyJob(): StoredRosterJob {
  return {
    id: randomUUID(),
    userId: "hashed-user",
    status: "ready",
    roster: sampleRoster,
    sourceMessageId: "message-id",
    createdAt: "2026-07-13T00:00:00.000Z",
    expiresAt: "2026-07-13T00:30:00.000Z",
  };
}

describe("LINE messages", () => {
  it("keeps the Calendar action label within LINE's 20-character limit", () => {
    const parsed = calendarActionSchema.parse(
      createCalendarReadyMessage("https://example.com/calendar.ics"),
    );
    expect(parsed.template.actions[0].label).toBe("เพิ่มใน Calendar");
  });

  it("places the roster review Flex message last", () => {
    const messages = createPreviewMessages(readyJob());
    expect(messages.at(-1)?.type).toBe("flex");
    expect(messages).toHaveLength(3);
  });

  it("shows shift and roster-status markers in the review", () => {
    const job = readyJob();
    job.roster = structuredClone(sampleRoster);
    job.roster.shifts[0].status = "SHIFT_CHANGE";
    job.roster.shifts[0].statusConfidence = 0.99;
    const messages = createPreviewMessages(job);
    expect(JSON.stringify(messages)).toContain("🟢 I8 · SHIFT CHANGE");
    expect(JSON.stringify(messages)).toContain("🔵 F9");
    expect(JSON.stringify(messages)).toContain("🟠 K9");
  });
});
