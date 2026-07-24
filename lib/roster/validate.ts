import {
  KNOWN_SHIFT_TIMES,
  MIN_SHIFT_CONFIDENCE,
  MIN_SPECIAL_EVENT_CONFIDENCE,
} from "@/lib/constants";
import type { RosterAnalysis, ValidationIssue } from "@/lib/types";
import {
  daysInMonth,
  isValidIsoDate,
  isValidTime,
  weekdayForIsoDate,
} from "@/lib/utils/date";

const UNREADABLE_WARNING =
  /(unreadable|blurry|cropped|illegible|อ่านไม่ออก|ไม่ชัด)/i;

export type RosterValidationResult = {
  valid: boolean;
  confirmable: boolean;
  issues: ValidationIssue[];
};

export function validateRoster(roster: RosterAnalysis): RosterValidationResult {
  const issues: ValidationIssue[] = [];
  if (roster.employee !== "NANCHAYA") {
    issues.push({ code: "employee", message: "ชื่อพนักงานไม่ใช่ NANCHAYA" });
  }
  if (roster.year < 2020 || roster.year > 2100) {
    issues.push({ code: "year", message: "ปีอยู่นอกช่วงที่รองรับ" });
  }

  const expectedDays = daysInMonth(roster.year, roster.month);
  if (roster.shifts.length !== expectedDays) {
    issues.push({
      code: "day_count",
      message: `ต้องมีข้อมูล ${expectedDays} วัน แต่พบ ${roster.shifts.length} วัน`,
    });
  }

  const dates = new Set<string>();
  const actualOffCount = roster.shifts.filter((shift) => shift.isDayOff).length;
  if (roster.printedOffCount === null) {
    issues.push({
      code: "missing_printed_off_count",
      message: "อ่านยอด OFF ท้ายแถว NANCHAYA ไม่ได้",
    });
  } else if (actualOffCount !== roster.printedOffCount) {
    issues.push({
      code: "off_count_mismatch",
      message: `จำนวน OFF ที่อ่านได้ ${actualOffCount} วัน ไม่ตรงกับยอด OFF ${roster.printedOffCount} ที่พิมพ์ในตาราง`,
    });
  }

  for (const shift of roster.shifts) {
    if (dates.has(shift.date)) {
      issues.push({
        code: "duplicate_date",
        message: "พบวันที่ซ้ำ",
        date: shift.date,
      });
    }
    dates.add(shift.date);
    if (!isValidIsoDate(shift.date)) {
      issues.push({
        code: "invalid_date",
        message: "วันที่ไม่ถูกต้อง",
        date: shift.date,
      });
      continue;
    }
    const [year, month] = shift.date.split("-").map(Number);
    if (year !== roster.year || month !== roster.month) {
      issues.push({
        code: "wrong_month",
        message: "วันที่ไม่ตรงกับเดือนของตารางเวร",
        date: shift.date,
      });
    }
    const expectedWeekday = weekdayForIsoDate(shift.date);
    if (shift.printedWeekday === null) {
      issues.push({
        code: "missing_printed_weekday",
        message: "อ่านหัววันในสัปดาห์ไม่ได้",
        date: shift.date,
      });
    } else if (shift.printedWeekday !== expectedWeekday) {
      issues.push({
        code: "weekday_mismatch",
        message: `หัวตารางพิมพ์ ${shift.printedWeekday} แต่วันที่นี้ต้องเป็น ${expectedWeekday}`,
        date: shift.date,
      });
    }
    if (shift.confidence < MIN_SHIFT_CONFIDENCE) {
      issues.push({
        code: "low_shift_confidence",
        message: `ความมั่นใจต่ำ (${shift.confidence.toFixed(2)})`,
        date: shift.date,
      });
    }
    if (shift.isDayOff) {
      if (shift.code !== "OFF" || shift.start !== null || shift.end !== null) {
        issues.push({
          code: "invalid_off",
          message: "วัน OFF ต้องไม่มีเวลาเริ่มและสิ้นสุด",
          date: shift.date,
        });
      }
    } else {
      if (
        !shift.start ||
        !shift.end ||
        !isValidTime(shift.start) ||
        !isValidTime(shift.end)
      ) {
        issues.push({
          code: "invalid_time",
          message: "เวลากะไม่ถูกต้อง",
          date: shift.date,
        });
      }
      const known = KNOWN_SHIFT_TIMES[shift.code];
      if (
        known &&
        shift.start &&
        shift.end &&
        (known.start !== shift.start || known.end !== shift.end)
      ) {
        issues.push({
          code: "known_code_mismatch",
          message: `${shift.code} มีเวลาไม่ตรงกับรายการอ้างอิง โปรดตรวจสอบด้วยตนเอง`,
          date: shift.date,
        });
      }
    }
  }

  for (let day = 1; day <= expectedDays; day += 1) {
    const date = `${roster.year}-${String(roster.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!dates.has(date)) {
      issues.push({
        code: "missing_date",
        message: "ไม่พบข้อมูลวันที่นี้",
        date,
      });
    }
  }

  for (const event of roster.specialEvents) {
    if (!isValidIsoDate(event.date)) {
      issues.push({
        code: "invalid_special_date",
        message: "วันที่กิจกรรมไม่ถูกต้อง",
        date: event.date,
      });
    }
    const [year, month] = event.date.split("-").map(Number);
    if (year !== roster.year || month !== roster.month) {
      issues.push({
        code: "special_wrong_month",
        message: "กิจกรรมอยู่นอกเดือนของตาราง",
        date: event.date,
      });
    }
    if (!isValidTime(event.start) || !isValidTime(event.end)) {
      issues.push({
        code: "invalid_special_time",
        message: "เวลากิจกรรมไม่ถูกต้อง",
        date: event.date,
      });
    }
    if (event.confidence < MIN_SPECIAL_EVENT_CONFIDENCE) {
      issues.push({
        code: "low_special_confidence",
        message: "ความมั่นใจกิจกรรมต่ำ",
        date: event.date,
      });
    }
    if (!/\bNANCHAYA\b/i.test(event.rawRemarkText)) {
      issues.push({
        code: "special_missing_employee",
        message: "ข้อความ REMARK ต้นทางไม่ได้ระบุ NANCHAYA",
        date: event.date,
      });
    }
  }

  for (const warning of roster.warnings) {
    if (warning.code.startsWith("independent_")) {
      issues.push({
        code: warning.code,
        message: warning.message,
        ...(warning.date ? { date: warning.date } : {}),
      });
    } else if (UNREADABLE_WARNING.test(`${warning.code} ${warning.message}`)) {
      issues.push({
        code: "unreadable_warning",
        message: warning.message,
        ...(warning.date ? { date: warning.date } : {}),
      });
    }
  }

  return {
    valid: issues.length === 0,
    confirmable: issues.length === 0,
    issues,
  };
}
