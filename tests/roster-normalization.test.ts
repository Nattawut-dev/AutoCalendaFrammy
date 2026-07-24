import { describe, expect, it } from "vitest";
import { normalizeRoster } from "@/lib/roster/normalize";
import { cloneSampleRoster } from "@/tests/fixtures/sample-roster";

describe("roster normalization", () => {
  it("keeps legacy roster data compatible by defaulting missing colors", () => {
    const roster = cloneSampleRoster();
    const legacy = structuredClone(roster) as unknown as {
      shifts: Array<Record<string, unknown>>;
    };
    for (const shift of legacy.shifts) {
      delete shift.status;
      delete shift.statusConfidence;
    }

    const normalized = normalizeRoster(legacy);
    expect(
      normalized.shifts.every(
        (shift) => shift.status === "NORMAL" && shift.statusConfidence === 1,
      ),
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
});
