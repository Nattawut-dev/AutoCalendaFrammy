import { describe, expect, it } from "vitest";
import {
  parseTextRoster,
  MANUAL_ROSTER_EXAMPLE,
} from "@/lib/roster/parse-text";
import { validateRoster } from "@/lib/roster/validate";
import { createRosterIcs } from "@/lib/calendar/create-ics";
import { rosterAnalysisSchema } from "@/lib/schemas";

describe("text roster to calendar", () => {
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
