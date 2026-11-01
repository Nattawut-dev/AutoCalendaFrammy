import "server-only";

import { randomBytes } from "node:crypto";
import { rosterAnalysisSchema } from "@/lib/schemas";
import { getRedis } from "@/lib/storage/redis";
import type { RosterAnalysis } from "@/lib/types";

/** Months kept before the current month; newer and future months are always kept. */
export const FEED_MONTHS_BACK = 12;

/** Unguessable link id: 24 random bytes, base64url. */
export const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export const monthsKey = (binding: string) => `roster-months:${binding}`;
export const feedTokenKey = (token: string) => `calendar-feed:${token}`;
export const feedUserKey = (binding: string) => `calendar-feed-user:${binding}`;

export const monthField = (roster: Pick<RosterAnalysis, "year" | "month">) =>
  `${roster.year}-${String(roster.month).padStart(2, "0")}`;

/** Oldest "YYYY-MM" still kept, counted from the current month in Bangkok. */
export function oldestKeptMonth(now = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const index =
    bangkok.getUTCFullYear() * 12 + bangkok.getUTCMonth() - FEED_MONTHS_BACK;
  return monthField({ year: Math.floor(index / 12), month: (index % 12) + 1 });
}

function parseStoredRoster(value: unknown): RosterAnalysis | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return rosterAnalysisSchema.parse(parsed);
  } catch {
    return null;
  }
}

/** Saves a confirmed month; sending the same month again replaces it. */
export async function saveConfirmedMonth(
  binding: string,
  roster: RosterAnalysis,
  now = new Date(),
): Promise<void> {
  const redis = getRedis();
  const key = monthsKey(binding);
  await redis.hset(key, { [monthField(roster)]: JSON.stringify(roster) });
  const oldest = oldestKeptMonth(now);
  const expired = (await redis.hkeys(key)).filter((field) => field < oldest);
  if (expired.length) await redis.hdel(key, ...expired);
}

/** All kept months, oldest first. */
export async function getFeedRosters(
  binding: string,
  now = new Date(),
): Promise<RosterAnalysis[]> {
  const stored =
    (await getRedis().hgetall<Record<string, unknown>>(monthsKey(binding))) ??
    {};
  const oldest = oldestKeptMonth(now);
  return Object.entries(stored)
    .filter(([field]) => field >= oldest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => parseStoredRoster(value))
    .filter((roster): roster is RosterAnalysis => roster !== null);
}

async function issueFeedToken(binding: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const redis = getRedis();
  await redis.set(feedTokenKey(token), binding);
  await redis.set(feedUserKey(binding), token);
  return token;
}

/** The user's calendar link id, created on first use. */
export async function getOrCreateFeedToken(
  binding: string,
): Promise<{ token: string; created: boolean }> {
  const existing = await getRedis().get<string>(feedUserKey(binding));
  if (existing && FEED_TOKEN_PATTERN.test(existing))
    return { token: existing, created: false };
  return { token: await issueFeedToken(binding), created: true };
}

/** Replaces the link; the old one stops working immediately. */
export async function resetFeedToken(binding: string): Promise<string> {
  const redis = getRedis();
  const old = await redis.get<string>(feedUserKey(binding));
  if (old) await redis.del(feedTokenKey(old));
  return issueFeedToken(binding);
}

export async function findFeedOwner(token: string): Promise<string | null> {
  if (!FEED_TOKEN_PATTERN.test(token)) return null;
  return getRedis().get<string>(feedTokenKey(token));
}
