import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCalendarDownloadUrl } from "@/lib/calendar/download-url";
import type { StoredRosterJob } from "@/lib/types";
import { sampleRoster } from "@/tests/fixtures/sample-roster";

describe("calendar download URL", () => {
  it("uses an ICS filename path that iOS can recognize", () => {
    const job: StoredRosterJob = {
      id: randomUUID(),
      userId: "hashed-user",
      status: "confirmed",
      roster: sampleRoster,
      sourceMessageId: "message-id",
      createdAt: "2026-07-13T00:00:00.000Z",
      expiresAt: "2026-07-13T00:30:00.000Z",
    };
    const url = new URL(
      createCalendarDownloadUrl(
        "https://example.vercel.app",
        job,
        "signed.token",
      ),
    );

    expect(url.pathname).toBe(`/api/calendar/${job.id}/NANCHAYA-2026-07.ics`);
    expect(url.searchParams.get("token")).toBe("signed.token");
    expect(url.searchParams.get("openExternalBrowser")).toBe("1");
  });
});
