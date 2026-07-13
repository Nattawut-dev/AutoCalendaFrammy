import { describe, expect, it } from "vitest";
import { calendarFilename, createRosterIcs } from "@/lib/calendar/create-ics";
import {
  cloneSampleRoster,
  sampleRoster,
} from "@/tests/fixtures/sample-roster";

function countOccurrences(value: string, term: string): number {
  return value.split(term).length - 1;
}

function uids(ics: string): string[] {
  return [...ics.matchAll(/^UID:(.+)$/gm)].map((match) => match[1].trim());
}

describe("ICS generation", () => {
  it("creates all work shifts and the special event while omitting OFF days", () => {
    const ics = createRosterIcs(sampleRoster);
    expect(countOccurrences(ics, "BEGIN:VEVENT")).toBe(22);
    expect(ics).not.toContain("SUMMARY:NANCHAYA — กะ OFF");
    expect(ics).toContain("SUMMARY:ERP TRAINING");
  });

  it("preserves overlapping work and training events", () => {
    const ics = createRosterIcs(sampleRoster);
    expect(
      countOccurrences(ics, "DTSTART;TZID=Asia/Bangkok:20260709T090000"),
    ).toBe(2);
    expect(ics).toContain("DTEND;TZID=Asia/Bangkok:20260709T180000");
    expect(ics).toContain("DTEND;TZID=Asia/Bangkok:20260709T160000");
  });

  it("produces stable, unique deterministic UIDs", () => {
    const first = uids(createRosterIcs(sampleRoster));
    const second = uids(createRosterIcs(sampleRoster));
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("uses Bangkok local time and a VTIMEZONE definition", () => {
    const ics = createRosterIcs(sampleRoster);
    expect(ics).toContain("TZID:Asia/Bangkok");
    expect(ics).toContain("TZOFFSETTO:+0700");
    expect(ics).toContain("DTSTART;TZID=Asia/Bangkok:20260701T090000");
  });

  it("escapes malicious text and blocks newline property injection", () => {
    const roster = cloneSampleRoster();
    roster.specialEvents[0].title =
      "Training, A; B\\C\r\nATTENDEE:evil@example.com";
    const ics = createRosterIcs(roster);
    expect(ics).toContain(
      "Training\\, A\\; B\\\\C\\nATTENDEE:evil@example.com",
    );
    expect(ics).not.toContain("\r\nATTENDEE:evil@example.com\r\n");
  });

  it("handles an overnight shift", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0] = {
      ...roster.shifts[0],
      code: "NIGHT",
      start: "22:00",
      end: "06:00",
    };
    const ics = createRosterIcs(roster);
    expect(ics).toContain("DTSTART;TZID=Asia/Bangkok:20260701T220000");
    expect(ics).toContain("DTEND;TZID=Asia/Bangkok:20260702T060000");
  });

  it("returns the safe required filename", () => {
    expect(calendarFilename(sampleRoster)).toBe("NANCHAYA-2026-07.ics");
  });
});
