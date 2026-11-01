import { describe, expect, it } from "vitest";
import {
  parseTextRoster,
  MANUAL_ROSTER_EXAMPLE,
} from "@/lib/roster/parse-text";
import { validateRoster } from "@/lib/roster/validate";
import { createRosterIcs } from "@/lib/calendar/create-ics";
import { rosterAnalysisSchema } from "@/lib/schemas";
import { SEPTEMBER_TEXT } from "./fixtures/september-text";
import { NOVEMBER_TEXT } from "./fixtures/november-text";

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

  it("accepts November OT-extended K9, H9 and OT DAYOFF", () => {
    const result = parseTextRoster(NOVEMBER_TEXT);
    if (!result?.ok) throw new Error(JSON.stringify(result));
    const roster = rosterAnalysisSchema.parse(result.roster);
    expect(validateRoster(roster).confirmable).toBe(true);
    const day = (n: number) => roster.shifts[n - 1];
    expect(day(2)).toMatchObject({
      code: "K9",
      status: "OT",
      start: "09:00",
      end: "21:00",
    });
    expect(day(3)).toMatchObject({ code: "K9", start: "11:00", end: "21:00" });
    expect(day(8)).toMatchObject({
      code: "H9",
      status: "SHIFT_CHANGE",
      start: "08:00",
      end: "18:00",
    });
    expect(day(30)).toMatchObject({ code: "F9", status: "OT_DAYOFF" });
    const ics = createRosterIcs(roster).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("DTSTART;TZID=Asia/Bangkok:20261102T090000");
  });

  it.each([
    NOVEMBER_TEXT.replace("🧡 K9 · 💜 OT — 09:00", "🧡 K9 — 09:00"),
    NOVEMBER_TEXT.replace(
      "🧡 K9 · 💜 OT — 09:00–21:00",
      "🧡 K9 · 💜 OT — 12:00–21:00",
    ),
  ])("rejects non-standard time unless OT covers the shift", (text) => {
    expect(parseTextRoster(text)).toMatchObject({ ok: false });
  });

  it("uses shift and OT times printed in the message legend over built-in times", () => {
    const legendText = NOVEMBER_TEXT.replace(
      "ตาราง 2026-11 OFF=9",
      "ตาราง 2026-11 OFF=9\nDETIALS:\nF9 : 06.00-16.00\nK9 : 11.00-21.00\nH9 : 08.00-18.00\nOT 09.00-11.00",
    );
    const result = parseTextRoster(legendText);
    if (!result?.ok) throw new Error(JSON.stringify(result));
    expect(result.roster.legend?.otTime).toEqual({
      start: "09:00",
      end: "11:00",
    });
    expect(
      validateRoster(rosterAnalysisSchema.parse(result.roster)).confirmable,
    ).toBe(true);

    // A new code exists only because the roster defines it.
    const newCode = parseTextRoster(
      legendText
        .replace("H9 : 08.00-18.00", "X7 : 07.00-14.00")
        .replace("H9 · 🎀 SHIFT CHANGE — 08:00–18:00", "X7 — 07:00–14:00"),
    );
    expect(newCode?.ok && newCode.roster.shifts[7]).toMatchObject({
      code: "X7",
      start: "07:00",
      end: "14:00",
    });

    // The legend wins over built-in K9 times.
    const moved = parseTextRoster(
      legendText.replace("K9 : 11.00-21.00", "K9 : 12.00-21.00"),
    );
    expect(moved).toMatchObject({ ok: false });

    // With printed OT hours the OT day must match them exactly.
    expect(
      parseTextRoster(legendText.replace("OT 09.00-11.00", "OT 10.00-11.00")),
    ).toMatchObject({ ok: false });
  });

  it("compact codes use legend times for unknown codes", () => {
    const result = parseTextRoster(
      MANUAL_ROSTER_EXAMPLE.replace("L8 H8 H8", "X7 H8 H8") +
        "\nX7 07:00-14:00",
    );
    expect(result?.ok && result.roster.shifts[0]).toMatchObject({
      code: "X7",
      start: "07:00",
      end: "14:00",
    });
    expect(
      parseTextRoster(MANUAL_ROSTER_EXAMPLE.replace("L8 H8 H8", "X7 H8 H8")),
    ).toMatchObject({ ok: false });
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
