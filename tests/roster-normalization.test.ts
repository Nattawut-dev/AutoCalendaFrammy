import { describe, expect, it } from "vitest";
import { normalizeRoster } from "@/lib/roster/normalize";
import { cloneSampleRoster } from "@/tests/fixtures/sample-roster";

describe("roster normalization", () => {
  it("keeps legacy roster data compatible by defaulting missing colors", () => {
    const roster = cloneSampleRoster();
    const legacy = structuredClone(roster) as unknown as {
      printedOffCount?: number | null;
      shifts: Array<Record<string, unknown>>;
    };
    delete legacy.printedOffCount;
    for (const shift of legacy.shifts) {
      delete shift.printedWeekday;
      delete shift.status;
      delete shift.statusConfidence;
    }

    const normalized = normalizeRoster(legacy);
    expect(normalized.printedOffCount).toBeNull();
    expect(
      normalized.shifts.every(
        (shift) => shift.status === "NORMAL" && shift.statusConfidence === 1,
      ),
    ).toBe(true);
    expect(
      normalized.shifts.every((shift) => shift.printedWeekday === null),
    ).toBe(true);
  });

  it("warns about uncertain color without changing a clear shift", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].status = "NORMAL";
    roster.shifts[0].statusConfidence = 0.4;

    const normalized = normalizeRoster(roster);
    expect(normalized.shifts[0]).toMatchObject({
      code: "I8",
      start: "09:00",
      end: "18:00",
      confidence: 0.99,
      status: "NORMAL",
      statusConfidence: 0.4,
    });
    expect(normalized.warnings).toContainEqual({
      code: "status_color_uncertain",
      message: "สีสถานะมีความมั่นใจต่ำ ระบบจึงไม่ใช้สีนี้เปลี่ยนรหัสกะหรือเวลา",
      date: "2026-07-01",
    });
  });

  it("populates missing start and end times from KNOWN_SHIFT_TIMES", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].start = null;
    roster.shifts[0].end = null;
    roster.shifts[1].start = null;
    roster.shifts[1].end = null;

    const normalized = normalizeRoster(roster);
    expect(normalized.shifts[0].code).toBe("I8");
    expect(normalized.shifts[0].start).toBe("09:00");
    expect(normalized.shifts[0].end).toBe("18:00");
    expect(normalized.shifts[1].code).toBe("L8");
    expect(normalized.shifts[1].start).toBe("12:00");
    expect(normalized.shifts[1].end).toBe("21:00");
  });

  it("normalizes coworker names and codes and empties them for OFF days", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].coworkers = [{ name: " mintra ", code: " l8 " }];
    roster.shifts[3].coworkers = [{ name: "SUNISA", code: "L8" }];

    const normalized = normalizeRoster(roster);
    expect(normalized.shifts[0].coworkers).toEqual([
      { name: "MINTRA", code: "L8" },
    ]);
    expect(normalized.shifts[3].isDayOff).toBe(true);
    expect(normalized.shifts[3].coworkers).toEqual([]);
  });
});
