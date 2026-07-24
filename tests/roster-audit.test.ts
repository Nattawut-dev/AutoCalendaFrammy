import { describe, expect, it } from "vitest";
import { applyIndependentAudit } from "@/lib/roster/audit";
import { validateRoster } from "@/lib/roster/validate";
import type { RosterAudit } from "@/lib/types";
import {
  cloneSampleRoster,
  sampleRoster,
} from "@/tests/fixtures/sample-roster";

function matchingAudit(): RosterAudit {
  return {
    employee: "NANCHAYA",
    month: sampleRoster.month,
    year: sampleRoster.year,
    printedOffCount: sampleRoster.printedOffCount,
    cells: sampleRoster.shifts.map((shift) => ({
      day: Number(shift.date.slice(-2)),
      printedWeekday: shift.printedWeekday ?? "SUN",
      code: shift.code,
      rawCellText: shift.rawCellText ?? shift.code,
      confidence: 0.99,
    })),
  };
}

describe("independent roster audit", () => {
  it("accepts an exact independent transcription", () => {
    const roster = applyIndependentAudit(cloneSampleRoster(), matchingAudit());
    expect(
      roster.warnings.filter((warning) =>
        warning.code.startsWith("independent_"),
      ),
    ).toEqual([]);
    expect(validateRoster(roster).confirmable).toBe(true);
  });

  it("blocks a swapped F9/K9 code even when OFF count still matches", () => {
    const audit = matchingAudit();
    const workCell = audit.cells.find((cell) => cell.code === "F9");
    expect(workCell).toBeDefined();
    workCell!.code = "K9";
    workCell!.rawCellText = "K9";

    const roster = applyIndependentAudit(cloneSampleRoster(), audit);
    const result = validateRoster(roster);
    expect(result.confirmable).toBe(false);
    expect(result.issues).toContainEqual({
      code: "independent_code_mismatch",
      message: "ผลหลักอ่าน F9 แต่ผลตรวจอิสระอ่าน K9",
      date: `2026-07-${String(workCell!.day).padStart(2, "0")}`,
    });
  });

  it("blocks a shifted or duplicated date column", () => {
    const audit = matchingAudit();
    audit.cells[1].day = audit.cells[2].day;

    const roster = applyIndependentAudit(cloneSampleRoster(), audit);
    const issueCodes = validateRoster(roster).issues.map((issue) => issue.code);
    expect(issueCodes).toContain("independent_duplicate_day");
    expect(issueCodes).toContain("independent_day_count_mismatch");
    expect(issueCodes).toContain("independent_missing_day");
  });
});
