import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { JOB_TTL_SECONDS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { storedRosterJobSchema } from "@/lib/schemas";
import { getRedis } from "@/lib/storage/redis";
import type {
  RosterAnalysis,
  RosterJobStatus,
  StoredRosterJob,
} from "@/lib/types";

export const jobKey = (jobId: string) => `roster-job:${jobId}`;
export const eventKey = (eventId: string) => `line-event:${eventId}`;

export function serializeJob(job: StoredRosterJob): string {
  return JSON.stringify(job);
}

export function deserializeJob(value: unknown): StoredRosterJob {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return storedRosterJobSchema.parse(parsed);
}

export function hashLineUserId(userId: string): string {
  return createHmac("sha256", getEnv().DOWNLOAD_TOKEN_SECRET)
    .update(`line-user:${userId}`)
    .digest("base64url");
}

export async function createRosterJob(input: {
  userId: string;
  roster: RosterAnalysis;
  sourceMessageId: string;
  status: Extract<RosterJobStatus, "ready" | "needs_review">;
}): Promise<StoredRosterJob> {
  const now = new Date();
  const job: StoredRosterJob = {
    id: randomUUID(),
    userId: input.userId,
    status: input.status,
    roster: input.roster,
    sourceMessageId: input.sourceMessageId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + JOB_TTL_SECONDS * 1000).toISOString(),
  };
  await getRedis().set(jobKey(job.id), serializeJob(job), {
    ex: JOB_TTL_SECONDS,
  });
  return job;
}

export async function getRosterJob(
  jobId: string,
): Promise<StoredRosterJob | null> {
  const value = await getRedis().get<string>(jobKey(jobId));
  return value === null ? null : deserializeJob(value);
}

export async function markRosterJobConfirmed(
  job: StoredRosterJob,
): Promise<StoredRosterJob> {
  const confirmed = { ...job, status: "confirmed" as const };
  const remainingSeconds = Math.max(
    1,
    Math.floor((Date.parse(job.expiresAt) - Date.now()) / 1000),
  );
  await getRedis().set(jobKey(job.id), serializeJob(confirmed), {
    ex: remainingSeconds,
  });
  return confirmed;
}

export async function deleteRosterJob(jobId: string): Promise<void> {
  await getRedis().del(jobKey(jobId));
}

export async function claimWebhookEvent(
  eventIdentifier: string,
): Promise<boolean> {
  const result = await getRedis().set(eventKey(eventIdentifier), "1", {
    nx: true,
    ex: JOB_TTL_SECONDS,
  });
  return result === "OK";
}
