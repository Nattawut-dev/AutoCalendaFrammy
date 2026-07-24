import { describe, expect, it } from "vitest";
import type { RosterAnalysis, RosterShift } from "@/lib/types";
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

  it("permits a work shift and training event to overlap", () => {
    const result = validateRoster(sampleRoster);
    expect(result.valid).toBe(true);
    expect(
      sampleRoster.shifts.find((shift) => shift.date === "2026-07-09")?.start,
    ).toBe("09:00");
    expect(sampleRoster.specialEvents[0].start).toBe("09:00");
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
    const shifts = Array.from({ length: 29 }, (_, index): RosterShift => ({
      date: `2028-02-${String(index + 1).padStart(2, "0")}`,
      code: "I8",
      start: "09:00",
      end: "18:00",
      isDayOff: false,
      source: "roster",
      confidence: 0.99,
      status: "NORMAL",
      statusConfidence: 1,
      rawCellText: "I8",
    }));
    const roster: RosterAnalysis = {
      employee: "NANCHAYA",
      month: 2,
      year: 2028,
      timezone: "Asia/Bangkok",
      shifts,
      specialEvents: [],
      warnings: [],
    };
    expect(validateRoster(roster).valid).toBe(true);
  });
});
