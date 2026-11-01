import { z } from "zod";
import { compactRosterSchema } from "@/lib/schemas";
import { expectedShiftTime, resolveShiftTime } from "@/lib/roster/legend";
import type { RosterAnalysis, RosterShift } from "@/lib/types";
import { cleanText } from "@/lib/utils/text";

export type CompactRoster = z.infer<typeof compactRosterSchema>;

const OFF_PATTERN = /^(OFF|DAY\s*OFF|O[F8][F8])$/i;
const CLEAR = 0.95;
const UNCERTAIN = 0.5;

/**
 * Builds the roster from what the model transcribed. Times come from the
 * printed legend (built-in times only as fallback) and coworkers are the other
 * rows working a known shift that day — computed here, never guessed by the model.
 */
export function expandCompactRoster(input: unknown): RosterAnalysis {
  const compact = compactRosterSchema.parse(input);
  const legend = {
    shiftTimes: compact.legend.shiftTimes.map((s) => ({
      ...s,
      code: cleanText(s.code).toUpperCase(),
    })),
    otTime: compact.legend.otTime,
  };
  const rows = compact.rows.map((row) => ({
    name: cleanText(row.name).toUpperCase(),
    cells: row.cells.map((cell) => cleanText(cell).toUpperCase()),
  }));
  const own = rows.find((row) => row.name === "NANCHAYA");
  if (!own) throw new Error("NANCHAYA row not found");
  const uncertain = new Set(compact.uncertainDays);
  const colored = new Map<number, RosterShift["status"]>();
  for (const { day, status } of compact.coloredDays) {
    if (colored.has(day) && colored.get(day) !== status) uncertain.add(day);
    colored.set(day, status);
  }
  const pad = (n: number) => String(n).padStart(2, "0");

  const shifts = own.cells.map<RosterShift>((cell, index) => {
    const day = index + 1;
    const date = `${compact.year}-${pad(compact.month)}-${pad(day)}`;
    const isDayOff = OFF_PATTERN.test(cell);
    const code = isDayOff ? "OFF" : cell;
    const status = colored.get(day) ?? "NORMAL";
    const time = isDayOff ? undefined : expectedShiftTime(code, status, legend);
    const confidence = uncertain.has(day) ? UNCERTAIN : CLEAR;
    return {
      date,
      printedWeekday: compact.weekdays[index] ?? null,
      code,
      start: time?.start ?? null,
      end: time?.end ?? null,
      isDayOff,
      source: "roster",
      confidence,
      status,
      statusConfidence: confidence,
      rawCellText: cell,
      coworkers: isDayOff
        ? []
        : rows
            .filter((row) => row !== own)
            .map((row) => ({ name: row.name, code: row.cells[index] ?? "" }))
            .filter((c) => c.code && resolveShiftTime(c.code, legend)),
    };
  });

  const warnings = [...compact.warnings];
  for (const row of rows)
    if (row.cells.length !== own.cells.length)
      warnings.push({
        code: "unreadable_row",
        message: `แถว ${row.name} อ่านได้ ${row.cells.length} ช่อง ไม่เท่ากับแถว NANCHAYA (${own.cells.length}) เพื่อนร่วมงานอาจไม่ถูกต้อง`,
        date: null,
      });
  for (const day of uncertain)
    warnings.push({
      code: "unreadable_cell",
      message: "อ่านรหัสหรือสีช่องนี้ไม่ชัด",
      date: `${compact.year}-${pad(compact.month)}-${pad(day)}`,
    });

  return {
    employee: "NANCHAYA",
    inputMethod: "image",
    month: compact.month,
    year: compact.year,
    timezone: "Asia/Bangkok",
    printedOffCount: compact.printedOffCount,
    legend,
    shifts,
    specialEvents: compact.specialEvents.map((event) => ({
      ...event,
      source: "remark",
      confidence: CLEAR,
    })),
    warnings,
  };
}
