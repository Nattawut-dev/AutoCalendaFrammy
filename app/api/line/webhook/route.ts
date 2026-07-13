import { createHash } from "node:crypto";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { AppError, GeminiAnalysisError } from "@/lib/errors";
import { analyzeRosterImage } from "@/lib/gemini/analyze-roster";
import {
  downloadLineMessageContent,
  replyMessages,
  type LineMessage,
} from "@/lib/line/client";
import { createPreviewMessages } from "@/lib/line/flex";
import {
  createCalendarReadyMessage,
  createCalendarUrlFallback,
  createGeminiErrorMessage,
  createGenericAnalysisErrorMessage,
  createHelpMessage,
  createRateLimitMessage,
  createReviewRequiredMessage,
  createUnauthorizedMessage,
  textMessage,
} from "@/lib/line/messages";
import { verifyLineSignature } from "@/lib/line/signature";
import { validateRoster } from "@/lib/roster/validate";
import {
  createDownloadToken,
  createUserBinding,
} from "@/lib/security/download-token";
import {
  claimWebhookEvent,
  consumeImageRateLimit,
  createRosterJob,
  deleteRosterJob,
  getRosterJob,
  hashLineUserId,
  markRosterJobConfirmed,
} from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const sourceSchema = z.object({ userId: z.string().optional() }).passthrough();
const baseEventSchema = z
  .object({
    type: z.string(),
    webhookEventId: z.string().optional(),
    replyToken: z.string().optional(),
    source: sourceSchema.optional(),
  })
  .passthrough();
const webhookSchema = z.object({
  events: z.array(baseEventSchema).default([]),
});

type WebhookEvent = z.infer<typeof baseEventSchema>;

function getEventIdentifier(event: WebhookEvent): string {
  const message = z
    .object({ id: z.string().optional() })
    .passthrough()
    .safeParse(event.message);
  return (
    event.webhookEventId ??
    message.data?.id ??
    createHash("sha256").update(JSON.stringify(event)).digest("base64url")
  );
}

async function safeReply(
  replyToken: string | undefined,
  messages: LineMessage[],
) {
  if (!replyToken) return;
  await replyMessages(replyToken, messages);
}

async function handleImage(event: WebhookEvent, userId: string): Promise<void> {
  const message = z
    .object({ id: z.string(), type: z.literal("image") })
    .passthrough()
    .parse(event.message);
  const userBinding = hashLineUserId(userId);
  if (!(await consumeImageRateLimit(userBinding))) {
    await safeReply(event.replyToken, [createRateLimitMessage()]);
    return;
  }

  const { bytes, mimeType } = await downloadLineMessageContent(message.id);
  const roster = await analyzeRosterImage(bytes, mimeType);
  const validation = validateRoster(roster);
  const job = await createRosterJob({
    userId: userBinding,
    roster,
    sourceMessageId: message.id,
    status: validation.confirmable ? "ready" : "needs_review",
  });
  if (!validation.confirmable) {
    await safeReply(event.replyToken, [
      createReviewRequiredMessage(validation.issues),
    ]);
    return;
  }
  await safeReply(event.replyToken, createPreviewMessages(job));
}

async function handleText(event: WebhookEvent): Promise<void> {
  const message = z
    .object({ type: z.literal("text"), text: z.string() })
    .passthrough()
    .parse(event.message);
  const normalized = message.text.trim().toLowerCase();
  if (["help", "ช่วยเหลือ", "วิธีใช้"].includes(normalized)) {
    await safeReply(event.replyToken, [createHelpMessage()]);
  }
}

async function handlePostback(
  event: WebhookEvent,
  userId: string,
): Promise<void> {
  const postback = z
    .object({ data: z.string().max(300) })
    .passthrough()
    .parse(event.postback);
  const params = new URLSearchParams(postback.data);
  const action = params.get("action");
  const jobIdResult = z.uuid().safeParse(params.get("job"));
  if (!jobIdResult.success || (action !== "confirm" && action !== "cancel"))
    return;
  const job = await getRosterJob(jobIdResult.data);
  const userBinding = hashLineUserId(userId);
  if (
    !job ||
    job.userId !== userBinding ||
    Date.parse(job.expiresAt) <= Date.now()
  ) {
    await safeReply(event.replyToken, [
      textMessage("งานนี้หมดอายุหรือไม่พบข้อมูล กรุณาส่งรูปใหม่"),
    ]);
    return;
  }
  if (action === "cancel") {
    await deleteRosterJob(job.id);
    await safeReply(event.replyToken, [
      textMessage("ยกเลิกการสร้าง Calendar แล้ว"),
    ]);
    return;
  }

  if (
    job.status === "needs_review" ||
    !validateRoster(job.roster).confirmable
  ) {
    await safeReply(event.replyToken, [
      textMessage("ข้อมูลยังไม่พร้อมยืนยัน กรุณาส่งรูปที่ชัดเจนกว่าเดิม"),
    ]);
    return;
  }
  const confirmed =
    job.status === "confirmed" ? job : await markRosterJobConfirmed(job);
  const env = getEnv();
  const token = createDownloadToken(
    confirmed.id,
    createUserBinding(userId, env.DOWNLOAD_TOKEN_SECRET),
    env.DOWNLOAD_TOKEN_SECRET,
  );
  const url = `${env.APP_BASE_URL}/api/calendar/${confirmed.id}?token=${encodeURIComponent(token)}`;
  await safeReply(event.replyToken, [
    createCalendarReadyMessage(url),
    createCalendarUrlFallback(url),
  ]);
}

async function processEvent(event: WebhookEvent): Promise<void> {
  const userId = event.source?.userId;
  if (!userId) return;
  const env = getEnv();
  if (!env.ALLOWED_LINE_USER_IDS.has(userId)) {
    await safeReply(event.replyToken, [createUnauthorizedMessage()]);
    return;
  }
  if (!(await claimWebhookEvent(getEventIdentifier(event)))) return;

  if (event.type === "message") {
    const messageType = z
      .object({ type: z.string() })
      .passthrough()
      .safeParse(event.message);
    if (messageType.data?.type === "image") await handleImage(event, userId);
    if (messageType.data?.type === "text") await handleText(event);
  } else if (event.type === "postback") {
    await handlePostback(event, userId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        operation: "webhook_configuration",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return Response.json({ ok: false }, { status: 500 });
  }
  if (
    !verifyLineSignature(
      rawBody,
      request.headers.get("x-line-signature"),
      env.LINE_CHANNEL_SECRET,
    )
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: true });
  }
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ ok: true });

  for (const event of parsed.data.events) {
    try {
      await processEvent(event);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          operation: "line_event_processing",
          eventType: event.type,
          eventId: event.webhookEventId ?? "unknown",
          errorCode:
            error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
        }),
      );
      try {
        await safeReply(event.replyToken, [
          error instanceof GeminiAnalysisError
            ? createGeminiErrorMessage(error.reason)
            : createGenericAnalysisErrorMessage(),
        ]);
      } catch {
        // Reply tokens are single-use; a failed reply is logged by the LINE client.
      }
    }
  }
  return Response.json({ ok: true });
}
