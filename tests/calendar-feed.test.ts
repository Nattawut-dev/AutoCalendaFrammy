import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFeedIcs } from "@/lib/calendar/create-ics";
import { createFeedResponse } from "@/lib/calendar/feed-response";
import { parseTextRoster } from "@/lib/roster/parse-text";
import {
  FEED_TOKEN_PATTERN,
  findFeedOwner,
  getFeedRosters,
  getOrCreateFeedToken,
  oldestKeptMonth,
  resetFeedToken,
  saveConfirmedMonth,
} from "@/lib/storage/feed";
import type { RosterAnalysis } from "@/lib/types";
import { NOVEMBER_TEXT } from "./fixtures/november-text";
import { SEPTEMBER_TEXT } from "./fixtures/september-text";

// In-memory stand-in for the Upstash calls the feed uses.
const store = new Map<string, unknown>();
vi.mock("@/lib/storage/redis", () => ({
  getRedis: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => Number(store.delete(key)),
    hset: async (key: string, fields: Record<string, unknown>) => {
      const hash = (store.get(key) as Record<string, unknown>) ?? {};
      store.set(key, { ...hash, ...fields });
    },
    hkeys: async (key: string) => Object.keys((store.get(key) as object) ?? {}),
    hdel: async (key: string, ...fields: string[]) => {
      const hash = { ...((store.get(key) as Record<string, unknown>) ?? {}) };
      for (const field of fields) delete hash[field];
      store.set(key, hash);
    },
    // Upstash returns stored JSON already parsed.
    hgetall: async (key: string) => {
      const hash = store.get(key) as Record<string, string> | undefined;
      if (!hash) return null;
      return Object.fromEntries(
        Object.entries(hash).map(([k, v]) => [k, JSON.parse(v)]),
      );
    },
  }),
}));

function roster(text: string): RosterAnalysis {
  const result = parseTextRoster(text);
  if (!result?.ok) throw new Error("fixture");
  return result.roster;
}
const november = roster(NOVEMBER_TEXT);
const september = roster(SEPTEMBER_TEXT);
const NOW = new Date("2026-11-01T03:00:00Z");
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const uids = (ics: string) => unfold(ics).match(/^UID:.*$/gm) ?? [];

beforeEach(() => store.clear());

describe("calendar feed", () => {
  it("keeps 12 months back from the current Bangkok month", () => {
    expect(oldestKeptMonth(NOW)).toBe("2025-11");
    // 31 Dec 17:30 UTC is already January in Bangkok.
    expect(oldestKeptMonth(new Date("2026-12-31T17:30:00Z"))).toBe("2026-01");
  });

  it("combines months, replaces a resent month and drops old months", async () => {
    await saveConfirmedMonth("user", september, NOW);
    await saveConfirmedMonth("user", november, NOW);
    const old = { ...november, year: 2025, month: 10 };
    await saveConfirmedMonth("user", old, NOW);

    const corrected = structuredClone(november);
    corrected.shifts[2] = {
      ...corrected.shifts[2],
      status: "OT",
      start: "09:00",
    };
    await saveConfirmedMonth("user", corrected, NOW);

    const rosters = await getFeedRosters("user", NOW);
    expect(rosters.map((r) => `${r.year}-${r.month}`)).toEqual([
      "2026-9",
      "2026-11",
    ]);
    expect(rosters[1].shifts[2].start).toBe("09:00");
  });

  it("gives a corrected shift the same event ID so it replaces the old one", () => {
    const corrected = structuredClone(november);
    corrected.shifts[2] = { ...corrected.shifts[2], start: "09:00" };
    const before = uids(createFeedIcs([november]));
    const after = uids(createFeedIcs([corrected]));
    expect(after).toEqual(before);
    expect(new Set(before).size).toBe(before.length);
    expect(unfold(createFeedIcs([corrected]))).toContain(
      "DTSTART;TZID=Asia/Bangkok:20261103T090000",
    );
  });

  it("builds one calendar with refresh hints, also when empty", () => {
    const ics = unfold(createFeedIcs([september, november]));
    expect(ics).toContain("X-WR-CALNAME:NANCHAYA Roster");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
    expect(ics).toContain("20260901T");
    expect(ics).toContain("20261130T");
    expect(createFeedIcs([])).toContain("BEGIN:VCALENDAR");
  });

  it("issues a secret link once and resets it on request", async () => {
    const first = await getOrCreateFeedToken("user");
    expect(first.created).toBe(true);
    expect(first.token).toMatch(FEED_TOKEN_PATTERN);
    expect(await getOrCreateFeedToken("user")).toEqual({
      token: first.token,
      created: false,
    });
    const next = await resetFeedToken("user");
    expect(next).not.toBe(first.token);
    expect(await findFeedOwner(first.token)).toBeNull();
    expect(await findFeedOwner(next)).toBe("user");
  });

  it("serves the calendar only for a live link", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveConfirmedMonth("user", november, new Date());
    const { token } = await getOrCreateFeedToken("user");

    const ok = await createFeedResponse(`${token}.ics`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toContain("text/calendar");
    expect(await ok.text()).toContain("20261102T090000");

    for (const file of [token, `${"x".repeat(32)}.ics`, "../x.ics"]) {
      expect((await createFeedResponse(file)).status).toBe(404);
    }
  });
});
