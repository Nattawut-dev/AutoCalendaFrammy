import { describe, expect, it } from "vitest";
import type { RosterAnalysis, RosterShift } from "@/lib/types";
import { weekdayForIsoDate } from "@/lib/utils/date";
import { validateRoster } from "@/lib/roster/validate";
import {
  cloneSampleRoster,
  sampleRoster,
} from "@/tests/fixtures/sample-roster";

describe("roster validation", () => {
  it("accepts the complete July 2026 fixture", () => {
    expect(validateRoster(sampleRoster)).toMatchObject({
      valid: true,
      confirmable: true,
    });
  });

  it("validates times against the legend read from the image", () => {
    const roster = cloneSampleRoster();
    const code = roster.shifts.find((s) => !s.isDayOff)!.code;
    const sameCode = roster.shifts.filter((s) => s.code === code);
    for (const s of sameCode) s.start = "05:00";
    expect(validateRoster(roster).issues.map((i) => i.code)).toContain(
      "known_code_mismatch",
    );
    roster.legend = {
      shiftTimes: [{ code, start: "05:00", end: sameCode[0].end! }],
      otTime: null,
    };
    expect(validateRoster(roster).confirmable).toBe(true);
  });

  it("rejects a missing day", () => {
    const roster = cloneSampleRoster();
    roster.shifts.splice(16, 1);
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "missing_date",
    );
  });

  it("rejects a duplicate date", () => {
    const roster = cloneSampleRoster();
    roster.shifts[17].date = roster.shifts[16].date;
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "duplicate_date",
    );
  });

  it("rejects an invalid date", () => {
    const roster = cloneSampleRoster();
    roster.shifts[30].date = "2026-07-32";
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "invalid_date",
    );
  });

  it("rejects an invalid time", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].start = "25:00";
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "invalid_time",
    );
  });

  it("rejects a low-confidence shift", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].confidence = 0.87;
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "low_shift_confidence",
    );
  });

  it("rejects an OFF count that differs from the printed roster total", () => {
    const roster = cloneSampleRoster();
    roster.printedOffCount = 9;
    const result = validateRoster(roster);
    expect(result.confirmable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "off_count_mismatch",
      message: "จำนวน OFF ที่อ่านได้ 10 วัน ไม่ตรงกับยอด OFF 9 ที่พิมพ์ในตาราง",
    });
  });

  it("rejects a shifted weekday header", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].printedWeekday = "FRI";
    const result = validateRoster(roster);
    expect(result.confirmable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "weekday_mismatch",
      message: "หัวตารางพิมพ์ FRI แต่วันที่นี้ต้องเป็น WED",
      date: "2026-07-01",
    });
  });

  it("rejects a roster when the printed OFF total is unreadable", () => {
    const roster = cloneSampleRoster();
    roster.printedOffCount = null;
    const result = validateRoster(roster);
    expect(result.confirmable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing_printed_off_count",
      message: "อ่านยอด OFF ท้ายแถว NANCHAYA ไม่ได้",
    });
  });

  it("permits a work shift and training event to overlap", () => {
    const result = validateRoster(sampleRoster);
    expect(result.valid).toBe(true);
    expect(
      sampleRoster.shifts.find((shift) => shift.date === "2026-07-09")?.start,
    ).toBe("09:00");
    expect(sampleRoster.specialEvents[0].start).toBe("09:00");
  });

  it("rejects a REMARK event that does not explicitly name NANCHAYA", () => {
    const roster = cloneSampleRoster();
    roster.specialEvents[0].rawRemarkText =
      "9 JUL ERP TRAINING 09:00-16:00 MINTRA";
    expect(validateRoster(roster).issues).toContainEqual({
      code: "special_missing_employee",
      message: "ข้อความ REMARK ต้นทางไม่ได้ระบุ NANCHAYA",
      date: "2026-07-09",
    });
  });

  it("rejects an employee other than NANCHAYA", () => {
    const roster = {
      ...cloneSampleRoster(),
      employee: "MINTRA",
    } as unknown as RosterAnalysis;
    expect(validateRoster(roster).issues.map((issue) => issue.code)).toContain(
      "employee",
    );
  });

  it("handles leap-year February", () => {
    const shifts = Array.from({ length: 29 }, (_, index): RosterShift => {
      const date = `2028-02-${String(index + 1).padStart(2, "0")}`;
      return {
        date,
        printedWeekday: weekdayForIsoDate(date),
        code: "I8",
        start: "09:00",
        end: "18:00",
        isDayOff: false,
        source: "roster",
        confidence: 0.99,
        status: "NORMAL",
        statusConfidence: 1,
        rawCellText: "I8",
        coworkers: [],
      };
    });
    const roster: RosterAnalysis = {
      employee: "NANCHAYA",
      month: 2,
      year: 2028,
      timezone: "Asia/Bangkok",
      printedOffCount: 0,
      shifts,
      specialEvents: [],
      warnings: [],
    };
    expect(validateRoster(roster).valid).toBe(true);
  });
});
