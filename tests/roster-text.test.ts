import { describe, expect, it } from "vitest";
import {
  parseTextRoster,
  MANUAL_ROSTER_EXAMPLE,
} from "@/lib/roster/parse-text";
import { validateRoster } from "@/lib/roster/validate";
import { createRosterIcs } from "@/lib/calendar/create-ics";
import { rosterAnalysisSchema } from "@/lib/schemas";
import { SEPTEMBER_TEXT } from "./fixtures/september-text";

describe("text roster to calendar", () => {
  it("preserves September coworkers and creates overlapping remarks separately, including on OFF", () => {
    const result = parseTextRoster(
      SEPTEMBER_TEXT + "\nREMARK 1-2 12:00-13:00 TRAINING",
    );
    if (!result?.ok) throw new Error(JSON.stringify(result));
    const roster = rosterAnalysisSchema.parse(result.roster);
    expect(validateRoster(roster).confirmable).toBe(true);
    expect(
      roster.shifts
        .filter((s) => s.isDayOff)
        .map((s) => Number(s.date.slice(-2))),
    ).toEqual([2, 6, 7, 10, 14, 18, 23, 24, 28, 29]);
    expect(roster.shifts[0].coworkers).toEqual([
      { name: "SUNISA", code: "F9" },
      { name: "JANTARAS", code: "F9" },
    ]);
    expect(roster.shifts[8].coworkers).toEqual([
      { name: "MINTRA", code: "L8" },
      { name: "SUNISA", code: "I8" },
    ]);
    const ics = createRosterIcs(roster).replace(/\r\n[ \t]/g, "");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(22);
    expect(ics.match(/DTSTART;TZID=Asia\/Bangkok:20260901T/g)).toHaveLength(2);
    expect(ics.match(/DTSTART;TZID=Asia\/Bangkok:20260902T/g)).toHaveLength(1);
    expect(ics).toContain("SUNISA (F9)");
    expect(ics).toContain("🌷 TRAINING");
    expect(ics).not.toContain("SUMMARY:กะ OFF");
  });

  it("accepts explicit status and remarks with shorthand input", () => {
    const detailed = parseTextRoster(
      SEPTEMBER_TEXT.replace("🧡 K9", "🧡 K9 · 🎀 SHIFT CHANGE"),
    );
    expect(detailed?.ok && detailed.roster.shifts[0].status).toBe(
      "SHIFT_CHANGE",
    );
    const compact = parseTextRoster(
      MANUAL_ROSTER_EXAMPLE + "\nREMARK 6-7 09:00-13:00 TRAINING",
    );
    expect(compact?.ok && compact.roster.specialEvents).toHaveLength(2);
  });

  it.each([
    SEPTEMBER_TEXT.replace("2 ก.ย. — OFF", "1 ก.ย. — OFF"),
    SEPTEMBER_TEXT.replace("2 ก.ย. — OFF", "31 ก.ย. — OFF"),
    SEPTEMBER_TEXT.replace("2 ก.ย. — OFF", ""),
    SEPTEMBER_TEXT.replace("1 ก.ย.", "1 ต.ค."),
    SEPTEMBER_TEXT.replace("11:00–21:00", "12:00–21:00"),
    SEPTEMBER_TEXT.replace("SUNISA [F9]", "SUNISA [F99]"),
    SEPTEMBER_TEXT.replace("SUNISA [F9]", "NANCHAYA [F9]"),
    SEPTEMBER_TEXT.replace(
      "SUNISA [F9], JANTARAS [F9]",
      "SUNISA [F9], SUNISA [F9]",
    ),
    SEPTEMBER_TEXT.replace(
      "2 ก.ย. — OFF",
      "2 ก.ย. — OFF (เข้ากับ: MINTRA [F9])",
    ),
    SEPTEMBER_TEXT.replace("🧡 K9", "🧡 K9 · UNKNOWN"),
    SEPTEMBER_TEXT + "\nREMARK 6-7 TRAINING",
    SEPTEMBER_TEXT + "\nREMARK 30-31 09:00-13:00 TRAINING",
    SEPTEMBER_TEXT + "\nREMARK 7-6 09:00-13:00 TRAINING",
    SEPTEMBER_TEXT + "\nREMARK 6 25:00-26:00 TRAINING",
    SEPTEMBER_TEXT + "\nREMARK 6 13:00-09:00 TRAINING",
    SEPTEMBER_TEXT + "\nREMARK 6 09:00-09:00 TRAINING",
    SEPTEMBER_TEXT +
      "\nREMARK 6 09:00-13:00 TRAINING\nREMARK 6 09:00-13:00 TRAINING",
  ])("rejects invalid detailed dates, coworkers and remarks", (text) => {
    expect(parseTextRoster(text)).toMatchObject({ ok: false });
  });

  it("turns the October roster into 21 correctly dated work events", () => {
    const result = parseTextRoster(MANUAL_ROSTER_EXAMPLE);
    if (!result?.ok) throw new Error("Expected a valid roster");
    const roster = rosterAnalysisSchema.parse(result.roster);
    expect(roster.inputMethod).toBe("text");
    expect(validateRoster(roster).confirmable).toBe(true);
    expect(
      roster.shifts
        .filter((s) => s.isDayOff)
        .map((s) => Number(s.date.slice(-2))),
    ).toEqual([4, 9, 13, 14, 19, 20, 23, 26, 27, 31]);
    expect(
      roster.shifts
        .filter((s) => s.code === "L8")
        .map((s) => Number(s.date.slice(-2))),
    ).toEqual([1, 22, 25]);
    const ics = createRosterIcs(roster);
    const events = [
      ...ics.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g),
    ].map((m) => m[1]);
    expect(events).toHaveLength(21);
    for (const shift of roster.shifts) {
      const date = shift.date.replaceAll("-", "");
      const matching = events.filter((event) =>
        event.includes(`DTSTART;TZID=Asia/Bangkok:${date}T`),
      );
      expect(matching).toHaveLength(shift.isDayOff ? 0 : 1);
      if (shift.isDayOff) continue;
      expect(matching[0]).toContain(
        `T${shift.code === "H8" ? "080000" : "120000"}`,
      );
      expect(matching[0]).toContain(
        `DTEND;TZID=Asia/Bangkok:${date}T${shift.code === "H8" ? "170000" : "210000"}`,
      );
    }
    expect(roster.specialEvents).toEqual([]);
  });

  it.each([
    [2024, 29],
    [2025, 28],
    [2567, 29],
  ])("handles February %i with %i days", (year, days) => {
    const result = parseTextRoster(
      `ตาราง ${year}-2 OFF=${days}\n${Array(days).fill("off").join(", ")}`,
    );
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.roster.shifts.at(-1)?.date).toBe(
      `${year > 2500 ? year - 543 : year}-02-${days}`,
    );
    expect(validateRoster(result.roster).confirmable).toBe(true);
  });

  it.each([
    MANUAL_ROSTER_EXAMPLE.replace("OFF=10", "OFF=9"),
    MANUAL_ROSTER_EXAMPLE.replace("L8 H8", "H8"),
    MANUAL_ROSTER_EXAMPLE + " H8",
    MANUAL_ROSTER_EXAMPLE.replace("L8 H8", "L8 H88"),
    MANUAL_ROSTER_EXAMPLE.replace("L8 H8", "L8 constructor"),
    MANUAL_ROSTER_EXAMPLE.replace("2026-10", "2026-13"),
    MANUAL_ROSTER_EXAMPLE.replace("2026-10", "1900-10"),
    MANUAL_ROSTER_EXAMPLE.replace("OFF=10", "OFF=32"),
    MANUAL_ROSTER_EXAMPLE.replace(" OFF=10", ""),
    MANUAL_ROSTER_EXAMPLE + "\nTRAINING 6-7",
    "ตาราง " + "X".repeat(5000),
  ])("rejects invalid or ambiguous input", (input) => {
    expect(parseTextRoster(input)).toMatchObject({
      ok: false,
      error: expect.any(String),
    });
  });

  it("ignores ordinary conversation", () => {
    expect(parseTextRoster("สวัสดี")).toBeNull();
  });
});
