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
    expect(ics).not.toContain("กะ OFF");
    expect(ics).toContain("ERP TRAINING");
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
    expect(ics).toContain("DTSTART:19700101T000000");
    expect(ics).not.toContain("DTSTART;TZID=Asia/Bangkok:19700101T000000");
  });

  it("keeps a purple background while markers distinguish shift codes", () => {
    const ics = createRosterIcs(sampleRoster);
    expect(countOccurrences(ics, "COLOR:mediumpurple")).toBe(22);
    expect(ics).not.toContain("COLOR:dodgerblue");
    expect(ics).not.toContain("COLOR:orange");
    expect(ics).toContain("🩵 NANCHAYA — กะ F9");
    expect(ics).toContain("🧡 NANCHAYA — กะ K9");
  });

  it("uses a roster status color without changing shift time", () => {
    const roster = cloneSampleRoster();
    roster.shifts[0].status = "OT";
    roster.shifts[0].statusConfidence = 0.99;
    const ics = createRosterIcs(roster);
    expect(ics).toContain("COLOR:mediumpurple");
    expect(ics).toContain("💜 NANCHAYA — กะ I8 · OT");
    expect(ics).toContain("DTSTART;TZID=Asia/Bangkok:20260701T090000");
    expect(ics).toContain("DTEND;TZID=Asia/Bangkok:20260701T180000");
  });

  it("creates an all-day event for a colored day-off status", () => {
    const roster = cloneSampleRoster();
    roster.shifts[3].status = "VACATION";
    roster.shifts[3].statusConfidence = 0.99;
    const ics = createRosterIcs(roster);
    expect(countOccurrences(ics, "BEGIN:VEVENT")).toBe(23);
    expect(ics).toContain("COLOR:mediumpurple");
    expect(ics).toContain("SUMMARY:🌹 NANCHAYA — VACATION");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260704");
    expect(ics).toContain("DURATION:P1D");
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
