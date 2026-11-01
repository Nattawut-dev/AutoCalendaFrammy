import { KNOWN_SHIFT_TIMES } from "@/lib/constants";
import type { RosterLegend, RosterStatus, ShiftTime } from "@/lib/types";

/** Legend printed on the roster first; built-in times only when it is silent. */
export function resolveShiftTime(
  code: string,
  legend?: RosterLegend,
): ShiftTime | undefined {
  const printed = legend?.shiftTimes.find((s) => s.code === code);
  if (printed) return { start: printed.start, end: printed.end };
  return KNOWN_SHIFT_TIMES[code];
}

/** Standard time for the day; OT days include the legend's OT hours when given. */
export function expectedShiftTime(
  code: string,
  status: RosterStatus,
  legend?: RosterLegend,
): ShiftTime | undefined {
  const base = resolveShiftTime(code, legend);
  const ot = legend?.otTime;
  if (!base || status !== "OT" || !ot) return base;
  return {
    start: ot.start < base.start ? ot.start : base.start,
    end: ot.end > base.end ? ot.end : base.end,
  };
}

/**
 * Exact match with the expected time. Without printed OT hours, an OT or
 * OT DAYOFF day may extend the shift as long as it still covers it.
 */
export function isAllowedShiftTime(
  code: string,
  status: RosterStatus,
  start: string,
  end: string,
  legend?: RosterLegend,
): boolean {
  const expected = expectedShiftTime(code, status, legend);
  if (!expected) return true;
  if (start === expected.start && end === expected.end) return true;
  const otHoursPrinted = status === "OT" && legend?.otTime;
  return (
    (status === "OT" || status === "OT_DAYOFF") &&
    !otHoursPrinted &&
    start <= expected.start &&
    end >= expected.end &&
    start < end
  );
}

const TIME = String.raw`(\d{1,2})[.:](\d{2})`;
const LEGEND_LINE = new RegExp(
  String.raw`^(?:กะ\s+)?([A-Za-z]{1,3}\d{0,2})\s*:?\s*${TIME}\s*[–-]\s*${TIME}$`,
);

const toTime = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** Parses a definition line like "H9 : 08.00-18.00" or "OT 09:00-11:00". */
export function parseLegendLine(
  line: string,
): ({ code: string } & ShiftTime) | null {
  const match = LEGEND_LINE.exec(line.trim());
  if (!match) return null;
  return {
    code: match[1].toUpperCase(),
    start: toTime(match[2], match[3]),
    end: toTime(match[4], match[5]),
  };
}
