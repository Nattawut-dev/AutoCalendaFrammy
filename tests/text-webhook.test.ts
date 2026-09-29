import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/line/webhook/route";
import { MANUAL_ROSTER_EXAMPLE } from "@/lib/roster/parse-text";
import { verifyDownloadToken } from "@/lib/security/download-token";
import type { StoredRosterJob } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  reply: vi.fn(),
  analyze: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  confirm: vi.fn(),
  claim: vi.fn(),
}));
const secret = "test-download-secret-at-least-32-characters";
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    LINE_CHANNEL_SECRET: "test-channel-secret",
    DOWNLOAD_TOKEN_SECRET: "test-download-secret-at-least-32-characters",
    APP_BASE_URL: "https://example.com",
    ALLOWED_LINE_USER_IDS: new Set(["allowed"]),
  }),
}));
vi.mock("@/lib/gemini/analyze-roster", () => ({
  analyzeRosterImage: mocks.analyze,
}));
vi.mock("@/lib/line/client", () => ({
  replyMessages: mocks.reply,
  downloadLineMessageContent: mocks.download,
}));
vi.mock("@/lib/storage/jobs", () => ({
  createRosterJob: mocks.create,
  getRosterJob: mocks.get,
  markRosterJobConfirmed: mocks.confirm,
  claimWebhookEvent: mocks.claim,
  deleteRosterJob: vi.fn(),
  hashLineUserId: (id: string) => `hashed-${id}`,
}));

function request(event: Record<string, unknown>, validSignature = true) {
  const body = JSON.stringify({ events: [event] });
  const signature = createHmac("sha256", "test-channel-secret")
    .update(body)
    .digest("base64");
  return new Request("https://example.com/api/line/webhook", {
    method: "POST",
    body,
    headers: { "x-line-signature": validSignature ? signature : "bad" },
  });
}
function textEvent(text = MANUAL_ROSTER_EXAMPLE, userId = "allowed") {
  return {
    type: "message",
    webhookEventId: "event-1",
    replyToken: "reply",
    source: { userId },
    message: { id: "message-1", type: "text", text },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(true);
  mocks.create.mockImplementation(async (input) => ({
    ...input,
    id: "c51e7f70-e4c9-4afb-a921-54c6c9ee41e2",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  }));
  mocks.confirm.mockImplementation(async (job) => ({
    ...job,
    status: "confirmed",
  }));
});

describe("manual roster LINE flow", () => {
  it("previews text input and creates a signed link only after confirmation without Gemini", async () => {
    expect((await POST(request(textEvent()))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "hashed-allowed",
        sourceMessageId: "message-1",
        status: "ready",
        roster: expect.objectContaining({
          inputMethod: "text",
          printedOffCount: 10,
        }),
      }),
    );
    const preview = JSON.stringify(mocks.reply.mock.calls[0][1]);
    expect(preview).toContain("ยืนยันสร้าง Calendar");
    expect(preview).toContain("ข้อมูลจากข้อความของคุณ");
    expect(preview).toContain("4 ต.ค. — OFF");
    expect(preview).not.toContain("/api/calendar/");
    const job: StoredRosterJob = await mocks.create.mock.results[0].value;
    mocks.get.mockResolvedValue(job);
    await POST(
      request({
        type: "postback",
        webhookEventId: "event-2",
        replyToken: "confirm-reply",
        source: { userId: "allowed" },
        postback: { data: `action=confirm&job=${job.id}` },
      }),
    );
    expect(mocks.confirm).toHaveBeenCalledOnce();
    const url = new URL(
      mocks.reply.mock.calls[1][1][0].template.actions[0].uri,
    );
    expect(url.pathname).toContain("NANCHAYA-2026-10.ics");
    expect(
      verifyDownloadToken(url.searchParams.get("token")!, job.id, secret).jobId,
    ).toBe(job.id);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rejects an OFF mismatch without storing a confirmable job", async () => {
    await POST(
      request(textEvent(MANUAL_ROSTER_EXAMPLE.replace("OFF=10", "OFF=9"))),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.reply.mock.calls)).toContain("นับ OFF ได้ 10");
  });

  it("shows instructions for the ตาราง command", async () => {
    await POST(request(textEvent("ตาราง")));
    expect(JSON.stringify(mocks.reply.mock.calls)).toContain("OFF=10");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not process unauthorized users", async () => {
    await POST(request(textEvent(MANUAL_ROSTER_EXAMPLE, "other")));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects invalid webhook signatures", async () => {
    expect((await POST(request(textEvent(), false))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("ignores a redelivered event", async () => {
    mocks.claim.mockResolvedValue(false);
    await POST(request(textEvent()));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  });
});
