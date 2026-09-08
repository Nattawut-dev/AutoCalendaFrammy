import { rosterAnalysisSchema } from "@/lib/schemas";
import { KNOWN_SHIFT_TIMES, MIN_STATUS_CONFIDENCE } from "@/lib/constants";
import type { RosterAnalysis } from "@/lib/types";
import { cleanText } from "@/lib/utils/text";

const OFF_PATTERN = /^(OFF|DAY\s*OFF|O[F8][F8])$/i;

export function normalizeRoster(input: unknown): RosterAnalysis {
  const parsed = rosterAnalysisSchema.parse(input);

  const shifts = parsed.shifts
    .map((shift) => {
      const rawCode = cleanText(shift.code).toUpperCase();
      const isOff = shift.isDayOff || OFF_PATTERN.test(rawCode);
      const knownTime = KNOWN_SHIFT_TIMES[rawCode];
      const start = isOff ? null : shift.start || knownTime?.start || null;
      const end = isOff ? null : shift.end || knownTime?.end || null;
      const coworkers = isOff
        ? []
        : (shift.coworkers ?? []).map((c) => ({
            name: cleanText(c.name).toUpperCase(),
            code: cleanText(c.code).toUpperCase(),
          }));
      return {
        ...shift,
        code: isOff ? "OFF" : rawCode,
        isDayOff: isOff,
        start,
        end,
        coworkers,
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

  const warnings = parsed.warnings.map((warning) => ({
    ...warning,
    code: cleanText(warning.code),
    message: cleanText(warning.message),
  }));
  const statusWarningDates = new Set(
    warnings
      .filter((warning) => warning.code === "status_color_uncertain")
      .map((warning) => warning.date),
  );
  for (const shift of shifts) {
    if (
      shift.statusConfidence < MIN_STATUS_CONFIDENCE &&
      !statusWarningDates.has(shift.date)
    ) {
      warnings.push({
        code: "status_color_uncertain",
        message:
          "สีสถานะมีความมั่นใจต่ำ ระบบจึงไม่ใช้สีนี้เปลี่ยนรหัสกะหรือเวลา",
        date: shift.date,
      });
    }
  }

  return {
    ...parsed,
    shifts,
    specialEvents,
    warnings,
  };
}
