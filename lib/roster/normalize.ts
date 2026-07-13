import { rosterAnalysisSchema } from "@/lib/schemas";
import type { RosterAnalysis } from "@/lib/types";
import { cleanText } from "@/lib/utils/text";

const OFF_PATTERN = /^(OFF|DAY\s*OFF|O[F8][F8])$/i;

export function normalizeRoster(input: unknown): RosterAnalysis {
  const parsed = rosterAnalysisSchema.parse(input);

  const shifts = parsed.shifts
    .map((shift) => {
      const rawCode = cleanText(shift.code).toUpperCase();
      const isOff = shift.isDayOff || OFF_PATTERN.test(rawCode);
      return {
        ...shift,
        code: isOff ? "OFF" : rawCode,
        isDayOff: isOff,
        start: isOff ? null : shift.start,
        end: isOff ? null : shift.end,
        rawCellText:
          shift.rawCellText === null ? null : cleanText(shift.rawCellText),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const specialEvents = parsed.specialEvents
    .map((event) => ({
      ...event,
      title: cleanText(event.title),
      rawRemarkText: cleanText(event.rawRemarkText),
    }))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );

  return {
    ...parsed,
    shifts,
    specialEvents,
    warnings: parsed.warnings.map((warning) => ({
      ...warning,
      code: cleanText(warning.code),
      message: cleanText(warning.message),
    })),
  };
}
