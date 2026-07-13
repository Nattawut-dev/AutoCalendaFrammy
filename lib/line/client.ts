import "server-only";

import { MAX_IMAGE_BYTES } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { LineContentDownloadError, UnsupportedImageError } from "@/lib/errors";

export type LineMessage = Record<string, unknown>;

const LINE_DATA_API = "https://api-data.line.me";
const LINE_MESSAGING_API = "https://api.line.me";
const REQUEST_TIMEOUT_MS = 12_000;

async function lineFetch(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export async function downloadLineMessageContent(messageId: string): Promise<{
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
}> {
  const response = await lineFetch(
    `${LINE_DATA_API}/v2/bot/message/${encodeURIComponent(messageId)}/content`,
    {
      headers: {
        Authorization: `Bearer ${getEnv().LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    },
    20_000,
  );
  if (!response.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        operation: "line_content_download",
        status: response.status,
      }),
    );
    throw new LineContentDownloadError();
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new UnsupportedImageError("Image exceeds 10 MB");
  }
  const declaredType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim();
  if (declaredType !== "image/jpeg" && declaredType !== "image/png") {
    throw new UnsupportedImageError("Only JPEG and PNG are supported");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new UnsupportedImageError("Image exceeds 10 MB");
  }
  const detectedType = detectImageType(bytes);
  if (!detectedType || detectedType !== declaredType) {
    throw new UnsupportedImageError("Image bytes do not match media type");
  }
  return { bytes, mimeType: detectedType };
}

async function sendLineMessages(
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await lineFetch(`${LINE_MESSAGING_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv().LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        operation: "line_message_send",
        path,
        status: response.status,
      }),
    );
    throw new Error("LINE message request failed");
  }
}

export async function replyMessages(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  if (messages.length < 1 || messages.length > 5) {
    throw new Error("LINE reply must contain between 1 and 5 messages");
  }
  await sendLineMessages("/v2/bot/message/reply", { replyToken, messages });
}

export async function pushMessages(
  userId: string,
  messages: LineMessage[],
): Promise<void> {
  if (messages.length < 1 || messages.length > 5) {
    throw new Error("LINE push must contain between 1 and 5 messages");
  }
  await sendLineMessages("/v2/bot/message/push", { to: userId, messages });
}
