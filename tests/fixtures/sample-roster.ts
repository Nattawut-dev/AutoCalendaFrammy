import type { RosterAnalysis, RosterShift } from "@/lib/types";
import { weekdayForIsoDate } from "@/lib/utils/date";

const shifts: Array<[string, string, string | null, string | null]> = [
  ["01", "I8", "09:00", "18:00"],
  ["02", "L8", "12:00", "21:00"],
  ["03", "L8", "12:00", "21:00"],
  ["04", "OFF", null, null],
  ["05", "OFF", null, null],
  ["06", "L8", "12:00", "21:00"],
  ["07", "L8", "12:00", "21:00"],
  ["08", "I8", "09:00", "18:00"],
  ["09", "I8", "09:00", "18:00"],
  ["10", "OFF", null, null],
  ["11", "OFF", null, null],
  ["12", "L8", "12:00", "21:00"],
  ["13", "L8", "12:00", "21:00"],
  ["14", "L8", "12:00", "21:00"],
  ["15", "OFF", null, null],
  ["16", "L8", "12:00", "21:00"],
  ["17", "L8", "12:00", "21:00"],
  ["18", "L8", "12:00", "21:00"],
  ["19", "L8", "12:00", "21:00"],
  ["20", "OFF", null, null],
  ["21", "OFF", null, null],
  ["22", "L8", "12:00", "21:00"],
  ["23", "L8", "12:00", "21:00"],
  ["24", "K9", "11:00", "21:00"],
  ["25", "OFF", null, null],
  ["26", "OFF", null, null],
  ["27", "OFF", null, null],
  ["28", "F9", "06:00", "16:00"],
  ["29", "K9", "11:00", "21:00"],
  ["30", "K9", "11:00", "21:00"],
  ["31", "K9", "11:00", "21:00"],
];

export const sampleRoster: RosterAnalysis = {
  employee: "NANCHAYA",
  month: 7,
  year: 2026,
  timezone: "Asia/Bangkok",
  printedOffCount: 10,
  shifts: shifts.map<RosterShift>(([day, code, start, end]) => {
    const date = `2026-07-${day}`;
    return {
      date,
      printedWeekday: weekdayForIsoDate(date),
      code,
      start,
      end,
      isDayOff: code === "OFF",
      source: "roster",
      confidence: 0.99,
      status: "NORMAL",
      statusConfidence: 1,
      rawCellText: code,
      coworkers:
        code === "OFF"
          ? []
          : day === "01"
            ? [
                { name: "MINTRA", code: "L8" },
                { name: "SUNISA", code: "L8" },
              ]
            : [],
    };
  }),
  specialEvents: [
    {
      date: "2026-07-09",
      title: "ERP TRAINING",
      start: "09:00",
      end: "16:00",
      source: "remark",
      confidence: 0.98,
      rawRemarkText: "9 JUL ERP TRAINING 09:00-16:00 NANCHAYA",
    },
  ],
  warnings: [],
};

export function cloneSampleRoster(): RosterAnalysis {
  return structuredClone(sampleRoster);
}

/** The same July roster in the short form Gemini now returns. */
export const sampleCompactRoster = {
  month: sampleRoster.month,
  year: sampleRoster.year,
  printedOffCount: sampleRoster.printedOffCount,
  legend: { shiftTimes: [], otTime: null },
  weekdays: sampleRoster.shifts.map((s) => s.printedWeekday).join(" "),
  rows: [
    {
      name: "MINTRA",
      cells: sampleRoster.shifts
        .map((_, i) => (i === 0 ? "L8" : "OFF"))
        .join(" "),
    },
    {
      name: "SUNISA",
      cells: sampleRoster.shifts
        .map((_, i) => (i === 0 ? "L8" : "VAC"))
        .join(" "),
    },
    {
      name: "NANCHAYA",
      cells: sampleRoster.shifts.map((s) => s.code).join(" "),
    },
  ],
  coloredDays: [],
  uncertainDays: [],
  specialEvents: sampleRoster.specialEvents.map(
    ({ date, title, start, end, rawRemarkText }) => ({
      date,
      title,
      start,
      end,
      rawRemarkText,
    }),
  ),
  warnings: [],
};
