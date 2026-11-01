import { describe, expect, it } from "vitest";
import { expandCompactRoster } from "@/lib/roster/expand-compact";
import { normalizeRoster } from "@/lib/roster/normalize";
import { parseTextRoster } from "@/lib/roster/parse-text";
import { validateRoster } from "@/lib/roster/validate";
import { NOVEMBER_TEXT } from "./fixtures/november-text";

// Transcription of "ROSTER ATA ON NOV 2026 REV.01" as Gemini returns it.
const november = {
  month: 11,
  year: 2026,
  printedOffCount: 9,
  legend: {
    shiftTimes: [
      { code: "F9", start: "06:00", end: "16:00" },
      { code: "K9", start: "11:00", end: "21:00" },
      { code: "H9", start: "08:00", end: "18:00" },
    ],
    otTime: { start: "09:00", end: "11:00" },
  },
  weekdays:
    "SUN MON TUE WED THU FRI SAT SUN MON TUE WED THU FRI SAT SUN MON TUE WED THU FRI SAT SUN MON TUE WED THU FRI SAT SUN MON",
  rows: [
    {
      name: "MINTRA",
      cells:
        "OFF F9 F9 F9 K9 OFF OFF OFF VAC F9 K9 K9 K9 OFF OFF F9 F9 F9 K9 K9 OFF OFF F9 F9 K9 K9 OFF F9 K9 K9",
    },
    {
      name: "SUNISA",
      cells:
        "K9 OFF OFF OFF F9 K9 K9 K9 K9 OFF F9 OFF OFF F9 F9 K9 K9 K9 OFF OFF F9 F9 K9 K9 OFF OFF F9 K9 K9 VAC",
    },
    { name: "JANTARAS", cells: Array(30).fill("LEAVE").join(" ") },
    {
      name: "NANCHAYA",
      cells:
        "F9 K9 K9 K9 OFF F9 F9 H9 F9 K9 OFF F9 F9 K9 K9 OFF OFF OFF F9 F9 K9 K9 OFF OFF F9 F9 K9 OFF OFF F9",
    },
  ],
  coloredDays: [
    { day: 2, status: "OT" },
    { day: 4, status: "OT" },
    { day: 8, status: "SHIFT_CHANGE" },
    { day: 16, status: "DAY_OFF_REQUEST" },
    { day: 17, status: "DAY_OFF_REQUEST" },
    { day: 18, status: "DAY_OFF_REQUEST" },
    { day: 27, status: "OT" },
    { day: 30, status: "OT_DAYOFF" },
  ],
  uncertainDays: [],
  specialEvents: [],
  warnings: [],
};

describe("expand compact Gemini transcription", () => {
  it("rebuilds November exactly like the checked text roster", () => {
    const roster = normalizeRoster(expandCompactRoster(november));
    expect(validateRoster(roster).confirmable).toBe(true);
    const text = parseTextRoster(NOVEMBER_TEXT);
    if (!text?.ok) throw new Error("fixture");
    roster.shifts.forEach((shift, i) => {
      const want = text.roster.shifts[i];
      expect([shift.date, shift.code, shift.start, shift.end]).toEqual([
        want.date,
        want.code,
        want.start,
        want.end,
      ]);
      expect(shift.coworkers).toEqual(want.coworkers);
    });
    // OT time comes from the printed key, computed in code.
    expect(roster.shifts[1]).toMatchObject({ start: "09:00", end: "21:00" });
    expect(roster.shifts[2]).toMatchObject({ start: "11:00", end: "21:00" });
  });

  it("does not guess times for a code the roster never defines", () => {
    const input = structuredClone(november);
    input.rows[3].cells = input.rows[3].cells.replace(/^F9/, "Z5");
    const roster = normalizeRoster(expandCompactRoster(input));
    expect(roster.shifts[0]).toMatchObject({ code: "Z5", start: null });
    expect(validateRoster(roster).confirmable).toBe(false);
  });

  it("blocks confirmation for unclear cells and misaligned rows", () => {
    const unclear = { ...structuredClone(november), uncertainDays: [5] };
    expect(
      validateRoster(normalizeRoster(expandCompactRoster(unclear))).confirmable,
    ).toBe(false);
    const short = structuredClone(november);
    short.rows[0].cells = short.rows[0].cells.split(" ").slice(1).join(" ");
    const roster = normalizeRoster(expandCompactRoster(short));
    expect(roster.warnings.map((w) => w.code)).toContain("unreadable_row");
  });

  it("rejects a transcription without the NANCHAYA row", () => {
    const input = structuredClone(november);
    input.rows = input.rows.filter((r) => r.name !== "NANCHAYA");
    expect(() => expandCompactRoster(input)).toThrow();
  });
});
